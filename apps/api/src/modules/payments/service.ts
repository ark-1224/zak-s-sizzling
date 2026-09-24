import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { createCheckoutSession, parseWebhookEvent, verifyWebhookSignature } from "../../lib/paymongo";
import { getIO } from "../../websocket";
import { HttpError } from "../../middleware/errorHandler";
import { getOrderById } from "../orders/service";
import { deductStockForOrder } from "../inventory/service";
import { createKitchenTasksForOrder } from "../kitchen/service";

async function loadPayableOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } }, payment: true },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.payment?.status === "paid") throw new HttpError(409, "Order is already paid");
  return order;
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
 * this as a no-op, not an error.
 */
async function markPaymentPaidIfNotAlready(
  order: { id: string; totalAmount: Prisma.Decimal; payment: { status: string } | null },
  updateData: Omit<Prisma.PaymentUpdateManyMutationInput, "status">,
  createData: Omit<Prisma.PaymentUncheckedCreateInput, "orderId" | "status" | "amount">
): Promise<boolean> {
  if (order.payment) {
    const result = await prisma.payment.updateMany({
      where: { orderId: order.id, status: { not: "paid" } },
      data: { status: "paid", ...updateData },
    });
    return result.count > 0;
  }

  try {
    await prisma.payment.create({
      data: { orderId: order.id, status: "paid", amount: order.totalAmount, ...createData },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

export async function confirmCounterPayment(orderId: string) {
  const order = await loadPayableOrder(orderId);

  const applied = await markPaymentPaidIfNotAlready(
    order,
    { method: "counter", paidAt: new Date() },
    { method: "counter", paidAt: new Date() }
  );
  if (!applied) throw new HttpError(409, "Order is already paid");

  await prisma.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
  await deductStockForOrder(order.id); // also emits inventory:updated per line item
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
  const applied = await markPaymentPaidIfNotAlready(
    order,
    { paidAt: new Date(), gatewayPayload: JSON.parse(rawBody.toString("utf8")) },
    { method: order.payment.method, paidAt: new Date() }
  );
  if (!applied) return; // already processed (gateway retry / duplicate delivery) — nothing more to do

  await prisma.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
  await deductStockForOrder(order.id);
  await createKitchenTasksForOrder(order.id);
  emitPaymentConfirmed(order);
}
