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

export async function confirmCounterPayment(orderId: string) {
  const order = await loadPayableOrder(orderId);

  await prisma.$transaction([
    prisma.payment.upsert({
      where: { orderId: order.id },
      update: { method: "counter", status: "paid", amount: order.totalAmount, paidAt: new Date() },
      create: {
        orderId: order.id,
        method: "counter",
        status: "paid",
        amount: order.totalAmount,
        paidAt: new Date(),
      },
    }),
    prisma.order.update({ where: { id: order.id }, data: { status: "confirmed" } }),
  ]);

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

  const order = await prisma.order.findUnique({ where: { id: event.orderId } });
  if (!order) return;

  await prisma.$transaction([
    prisma.payment.update({
      where: { orderId: order.id },
      data: { status: "paid", paidAt: new Date(), gatewayPayload: JSON.parse(rawBody.toString("utf8")) },
    }),
    prisma.order.update({ where: { id: order.id }, data: { status: "confirmed" } }),
  ]);

  await deductStockForOrder(order.id);
  await createKitchenTasksForOrder(order.id);
  emitPaymentConfirmed(order);
}
