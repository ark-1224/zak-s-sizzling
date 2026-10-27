import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { createQrPhCode, getPaymentIntent, isPaymongoConfigured, parseWebhookEvent, PaymongoNotConfiguredError, verifyWebhookSignature } from "../../lib/paymongo";
import { emitOrdersChanged, getIO } from "../../websocket";
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
  emitOrdersChanged();
}

/**
 * Starts (or restarts, after a code expires) a QR Ph payment: asks PayMongo for a QR code
 * and records the payment as pending, with the Payment Intent as its reference. The kiosk
 * shows the code on its own screen.
 */
export async function createQrPhPayment(orderId: string) {
  const order = await loadPayableOrder(orderId);
  if (!isPaymongoConfigured()) {
    // The kiosk falls back to "Pay at counter" on this error, so record the order as a
    // counter order too, and staff see it labelled that way (UI review #2).
    await prisma.payment.upsert({
      where: { orderId: order.id },
      update: { method: "counter" },
      create: { orderId: order.id, method: "counter", status: "pending", amount: order.totalAmount },
    });
    emitOrdersChanged();
    throw new PaymongoNotConfiguredError();
  }

  const code = await createQrPhCode({ orderId: order.id, orderNumber: order.orderNumber, amountPhp: Number(order.totalAmount) });

  await prisma.payment.upsert({
    where: { orderId: order.id },
    update: { method: "qrph", status: "pending", amount: order.totalAmount, reference: code.paymentIntentId },
    create: { orderId: order.id, method: "qrph", status: "pending", amount: order.totalAmount, reference: code.paymentIntentId },
  });
  emitOrdersChanged();

  return { imageUrl: code.imageUrl, expiresAt: code.expiresAt, testUrl: code.testUrl };
}

/**
 * The kiosk asks this every few seconds while the QR code is on screen. If the payment
 * isn't recorded yet, it asks PayMongo whether the Payment Intent has succeeded, and if
 * so records it exactly as the webhook would (whichever comes first wins; the other is a
 * no-op). Returns the order as it now stands.
 */
export async function checkQrPhPayment(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
  if (!order) throw new HttpError(404, "Order not found");
  const payment = order.payment;
  if (payment && payment.status !== "paid" && payment.method === "qrph" && payment.reference && isPaymongoConfigured()) {
    const intent = await getPaymentIntent(payment.reference);
    const expected = Math.round(Number(order.totalAmount) * 100);
    if (intent.status === "succeeded" && intent.amountCentavos === expected) {
      await recordOnlinePayment(order, { paidAt: new Date() }, { method: "qrph", paidAt: new Date() });
    }
  }
  return getOrderById(orderId);
}

/**
 * The customer chose to pay at the counter instead of scanning: the order becomes an
 * ordinary counter order in the staff queue. Refused once the order is paid.
 */
export async function switchToCounterPayment(orderId: string) {
  const order = await loadPayableOrder(orderId);
  await prisma.payment.updateMany({
    where: { orderId: order.id, status: { not: "paid" } },
    data: { method: "counter", reference: null },
  });
  emitOrdersChanged();
  return getOrderById(order.id);
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

type OrderWithPayment = Prisma.OrderGetPayload<{ include: { payment: true } }>;

/**
 * Records a payment PayMongo has taken: marks it paid, deducts the stock, confirms the
 * order and sends it to the kitchen, all or nothing. Shared by the webhook and the
 * kiosk's status check, so whichever arrives first does the work and the other changes
 * nothing. When the order was cancelled meanwhile, or stock ran out, the money is
 * recorded but nothing goes to the kitchen, and the order is flagged for staff.
 */
async function recordOnlinePayment(
  order: OrderWithPayment,
  paymentUpdate: Omit<Prisma.PaymentUpdateManyMutationInput, "status">,
  paymentCreate: Omit<Prisma.PaymentUncheckedCreateInput, "orderId" | "status" | "amount">
) {
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
      // Staff cancelled the order while the customer was paying. The money was taken, so
      // record it, deduct nothing, and flag the order so staff refund the customer (it
      // shows in the payment queue with a stock-issue badge).
      const applied = await markPaymentPaidIfNotAlready(prisma, order, paymentUpdate, paymentCreate);
      if (!applied) return;
      await prisma.order.update({
        where: { id: order.id },
        data: { stockIssue: true, stockIssueNote: "Paid online after this order was cancelled. Refund the customer, or place the order again." },
      });
      emitOrdersChanged();
      console.warn(`[payments] order ${order.orderNumber} was paid online after it was cancelled`);
      return;
    }
    if (!(err instanceof StockShortageError)) throw err;

    // The customer already paid, so this can't be refused like a counter order. Record the
    // payment, deduct nothing (stock never goes negative), create no kitchen tasks, and
    // flag the order so staff substitute or refund.
    const applied = await markPaymentPaidIfNotAlready(prisma, order, paymentUpdate, paymentCreate);
    if (!applied) return;
    await prisma.order.update({
      where: { id: order.id },
      data: { stockIssue: true, stockIssueNote: err.message.slice(0, 300) },
    });
    emitOrdersChanged();
    console.warn(`[payments] order ${order.orderNumber} paid online but stock is short: ${err.message}`);
  }
}

// payment.paid comes from the QR Ph flow (Payment Intents); checkout_session.payment.paid
// from PayMongo's hosted checkout, which earlier versions used.
const PAID_EVENTS = ["payment.paid", "checkout_session.payment.paid"];

export async function handleWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    throw new HttpError(401, "Invalid webhook signature");
  }

  const event = parseWebhookEvent(rawBody);
  if (!PAID_EVENTS.includes(event.type)) return;

  // The order is named in the intent's metadata; failing that, find it by the Payment
  // Intent stored as the payment's reference.
  const where = event.orderId
    ? { id: event.orderId }
    : event.paymentIntentId
      ? { payment: { reference: event.paymentIntentId } }
      : null;
  if (!where) return;
  const order = await prisma.order.findFirst({ where, include: { payment: true } }).catch(() => null);
  if (!order) return;

  // A pending payment row always exists before the customer can pay (it is created with
  // the order), so a webhook with no row means something upstream is broken: bail rather
  // than synthesize a method we don't actually know.
  if (!order.payment) {
    console.error(`[payments] webhook for order ${order.id} has no existing payment record — ignoring`);
    return;
  }

  // Deliberately doesn't touch `method` on update: the row already has the right value.
  await recordOnlinePayment(
    order,
    { paidAt: new Date(), gatewayPayload: JSON.parse(rawBody.toString("utf8")) },
    { method: order.payment.method, paidAt: new Date() }
  );
}

