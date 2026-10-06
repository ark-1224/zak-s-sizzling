import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { createCheckoutSession, parseWebhookEvent, verifyWebhookSignature } from "../../lib/paymongo";
import { getIO } from "../../websocket";
import { HttpError } from "../../middleware/errorHandler";
import { getOrderById } from "../orders/service";
import { deductStockForOrder, refreshAvailability, StockShortageError } from "../inventory/fulfillment";
import { createKitchenTasksForOrder } from "../kitchen/service";

async function loadPayableOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } }, payment: true },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.payment?.status === "paid") throw new HttpError(409, "Order is already paid");
  if (order.status === "cancelled") throw new HttpError(409, cancelledMessage(order.orderNumber));
  return order;
}

const cancelledMessage = (orderNumber: string) => `${orderNumber} was cancelled, so it can't be paid`;

/** Thrown inside a payment transaction when the order was cancelled meanwhile, to roll it back. */
class OrderCancelledError extends Error {}

/**
 * Confirms the order only if it is still pending. Cancelling is one conditional update
 * too (orders/service.ts), so whichever commits first wins and the other is refused.
 */
async function confirmPendingOrder(tx: Prisma.TransactionClient, orderId: string) {
  const result = await tx.order.updateMany({
    where: { id: orderId, status: "pending" },
    data: { status: "confirmed", stockIssue: false, stockIssueNote: null },
  });
  if (result.count === 0) throw new OrderCancelledError();
}

function emitPaymentConfirmed(order: { id: string; orderNumber: string; kioskSessionId: string | null }) {
  getIO()?.emit("payment:confirmed", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    kioskSessionId: order.kioskSessionId,
  });
}

export async function createGatewayPaymentIntent(orderId: string, method: "gcash" | "maya", webOrigin: string) {
  const order = await loadPayableOrder(orderId);

  const session = await createCheckoutSession({
    orderId: order.id,
    orderNumber: order.orderNumber,
    method,
    amountPhp: Number(order.totalAmount),
    lineItems: order.items.map((i) => ({ name: i.product.name, qty: i.qty, unitPricePhp: Number(i.unitPrice) })),
    successUrl: `${webOrigin}/checkout/success?order=${order.id}`,
    cancelUrl: `${webOrigin}/checkout?order=${order.id}&cancelled=1`,
  });

  await prisma.payment.upsert({
    where: { orderId: order.id },
    update: { method, status: "pending", amount: order.totalAmount, reference: session.id },
    create: { orderId: order.id, method, status: "pending", amount: order.totalAmount, reference: session.id },
  });

  return { checkoutUrl: session.checkoutUrl };
}

/**
 * Atomically marks a payment paid — shared by the staff counter-payment confirmation
 * and the PayMongo webhook, both of which can legitimately fire more than once for
 * the same order (a double-click, or a gateway retrying webhook delivery on
 * timeout). When a payment row already exists, the "not already paid" check and the
 * write happen in one SQL statement (an `updateMany` whose WHERE clause re-checks
 * status), closing the race a separate check-then-act would leave open — the second
 * of two concurrent calls sees the first one's write and affects 0 rows instead of
 * both proceeding to deduct stock. When no row exists yet, the create is guarded by
 * the payment table's unique `orderId` constraint, so a concurrent duplicate create
 * loses to Postgres itself rather than a JS-level check that could itself race.
 * Returns false if another call already handled it — the caller should then treat
 * this as a no-op, not an error. Pass the transaction client to make marking paid
 * part of a larger all-or-nothing change.
 */
async function markPaymentPaidIfNotAlready(
  db: Prisma.TransactionClient,
  order: { id: string; totalAmount: Prisma.Decimal; payment: { status: string } | null },
  updateData: Omit<Prisma.PaymentUpdateManyMutationInput, "status">,
  createData: Omit<Prisma.PaymentUncheckedCreateInput, "orderId" | "status" | "amount">
): Promise<boolean> {
  if (order.payment) {
    const result = await db.payment.updateMany({
      where: { orderId: order.id, status: { not: "paid" } },
      data: { status: "paid", ...updateData },
    });
    return result.count > 0;
  }

  try {
    await db.payment.create({
      data: { orderId: order.id, status: "paid", amount: order.totalAmount, ...createData },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

/**
 * Staff confirm a counter order before collecting payment. Marking it paid, deducting
 * every unit and raw material it needs, and confirming the order happen in one
 * transaction: if anything is short, StockShortageError (409) rolls it all back, so
 * nothing is deducted, the order stays unpaid, and staff can change it with the
 * customer before any money changes hands.
 */
export async function confirmCounterPayment(orderId: string) {
  const order = await loadPayableOrder(orderId);

  const touched = await prisma
    .$transaction(async (tx) => {
      const applied = await markPaymentPaidIfNotAlready(
        tx,
        order,
        { method: "counter", paidAt: new Date() },
        { method: "counter", paidAt: new Date() }
      );
      if (!applied) throw new HttpError(409, "Order is already paid");

      const touched = await deductStockForOrder(tx, order.id);
      await confirmPendingOrder(tx, order.id);
      return touched;
    })
    .catch((err) => {
      if (err instanceof OrderCancelledError) throw new HttpError(409, cancelledMessage(order.orderNumber));
      throw err;
    });

  await refreshAvailability(touched); // emits inventory:updated for affected products
  await createKitchenTasksForOrder(order.id); // also emits order:created
  emitPaymentConfirmed(order);
  return getOrderById(order.id);
}

export async function handleWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    throw new HttpError(401, "Invalid webhook signature");
  }

  const event = parseWebhookEvent(rawBody);
  if (!event.orderId || !event.type.includes("paid")) return;

  const order = await prisma.order.findUnique({
    where: { id: event.orderId },
    include: { payment: true },
  });
  if (!order) return;

  // createGatewayPaymentIntent always creates the pending payment row (with the real
  // gcash/maya method) before the customer ever reaches PayMongo's hosted checkout, so
  // a webhook arriving with no existing row would mean something upstream is broken —
  // bail rather than synthesize a method we don't actually know.
  if (!order.payment) {
    console.error(`[payments] webhook for order ${order.id} has no existing payment record — ignoring`);
    return;
  }

  // Deliberately doesn't touch `method` on update — the existing row already has the
  // correct gcash/maya value from checkout-intent time.
  const paymentUpdate = { paidAt: new Date(), gatewayPayload: JSON.parse(rawBody.toString("utf8")) };
  const paymentCreate = { method: order.payment.method, paidAt: new Date() };

  try {
    const touched = await prisma.$transaction(async (tx) => {
      const applied = await markPaymentPaidIfNotAlready(tx, order, paymentUpdate, paymentCreate);
      if (!applied) return null; // already processed (gateway retry / duplicate delivery)

      const touched = await deductStockForOrder(tx, order.id);
      await confirmPendingOrder(tx, order.id);
      return touched;
    });
    if (!touched) return;

    await refreshAvailability(touched);
    await createKitchenTasksForOrder(order.id);
    emitPaymentConfirmed(order);
  } catch (err) {
    if (err instanceof OrderCancelledError) {
      // Staff cancelled the order while the customer was still on PayMongo's page. The
      // money was taken, so record it, deduct nothing, and flag the order so staff refund
      // the customer (it shows in the payment queue with a stock-issue badge).
      const applied = await markPaymentPaidIfNotAlready(prisma, order, paymentUpdate, paymentCreate);
      if (!applied) return;
      await prisma.order.update({
        where: { id: order.id },
        data: { stockIssue: true, stockIssueNote: "Paid online after this order was cancelled. Refund the customer, or place the order again." },
      });
      console.warn(`[payments] order ${order.orderNumber} was paid online after it was cancelled`);
      return;
    }
    if (!(err instanceof StockShortageError)) throw err;

    // The customer already paid on PayMongo's page, so this can't be refused like a
    // counter order. Record the payment, deduct nothing (stock never goes negative),
    // create no kitchen tasks, and flag the order so staff substitute or refund.
    const applied = await markPaymentPaidIfNotAlready(prisma, order, paymentUpdate, paymentCreate);
    if (!applied) return;
    await prisma.order.update({
      where: { id: order.id },
      data: { stockIssue: true, stockIssueNote: err.message.slice(0, 300) },
    });
    console.warn(`[payments] order ${order.orderNumber} paid online but stock is short: ${err.message}`);
  }
}
