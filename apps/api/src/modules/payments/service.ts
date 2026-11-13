import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import {
  createQrPhCode,
  getPaymentIntent,
  isPaymongoConfigured,
  parseWebhookEvent,
  PaymongoNotConfiguredError,
  toCentavos,
  verifyWebhookSignature,
} from "../../lib/paymongo";
import { emitOrdersChanged, getIO } from "../../websocket";
import { HttpError } from "../../middleware/errorHandler";
import { getOrderById } from "../orders/service";
import { deductStockForOrder, refreshAvailability, StockShortageError, type TouchedStock } from "../inventory/fulfillment";
import { createKitchenTasksForOrder } from "../kitchen/service";
import { addAttentionNote, lockOrder } from "./attentionNote";

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
 * too (orders/service.ts), so whichever commits first wins and the other is refused. It
 * leaves a NEEDS ATTENTION flag alone: only Mark as sorted out, which checks the note staff
 * read, settles that.
 */
async function confirmPendingOrder(tx: Prisma.TransactionClient, orderId: string) {
  const result = await tx.order.updateMany({
    where: { id: orderId, status: "pending" },
    data: { status: "confirmed" },
  });
  if (result.count === 0) throw new OrderCancelledError();
}

/**
 * Puts a note on the order for staff to act on, inside the caller's transaction: it shows
 * in the payment queue with a NEEDS ATTENTION badge. The note says what happened and what
 * to do (refund, collect the difference, offer a substitute), since the screens show it as
 * written. Returns false for a repeated delivery of the same event, which changes nothing;
 * a note about a particular payment names its PayMongo code, so another payment isn't
 * taken for a repeat.
 */
async function addNoteForStaff(tx: Prisma.TransactionClient, orderId: string, note: string): Promise<boolean> {
  await lockOrder(tx, orderId);
  const current = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { stockIssue: true, stockIssueNote: true } });
  if (current.stockIssueNote?.includes(note)) return false;
  await tx.order.update({
    where: { id: orderId },
    data: { stockIssue: true, stockIssueNote: addAttentionNote(current.stockIssueNote, current.stockIssue, note) },
  });
  return true;
}

/** Once a note is committed: open screens reload. */
function announceNote(order: { orderNumber: string }, note: string) {
  emitOrdersChanged();
  console.warn(`[payments] order ${order.orderNumber}: ${note}`);
}

async function flagForStaff(order: { id: string; orderNumber: string }, note: string) {
  if (await prisma.$transaction((tx) => addNoteForStaff(tx, order.id, note))) announceNote(order, note);
}

/** " (PayMongo pi_…)" when the payment's code is known. */
const paymongoCode = (reference: string | null) => (reference ? ` (PayMongo ${reference})` : "");

const pesos = (centavos: number) => `₱${(centavos / 100).toFixed(2)}`;
const totalCentavos = (order: { totalAmount: Prisma.Decimal }) => toCentavos(Number(order.totalAmount));

/** A paid amount that isn't the order's total: recorded for staff, never confirmed. */
function wrongAmountNote(paidCentavos: number, order: { totalAmount: Prisma.Decimal }, reference: string | null) {
  return `${pesos(paidCentavos)} was paid online, but the order total is ${pesos(totalCentavos(order))}${paymongoCode(reference)}. Refund it, or collect the difference, before confirming.`;
}

/**
 * Once a payment has committed: the order is paid and in the kitchen whatever happens here,
 * so a failure is logged rather than answered as an error. The next stock change on that
 * product corrects its availability.
 */
async function announcePaidOrder(order: { id: string; orderNumber: string; kioskSessionId: string | null }, touched: TouchedStock) {
  try {
    await refreshAvailability(touched); // emits inventory:updated for affected products
  } catch (err) {
    console.error(`[payments] order ${order.orderNumber}: couldn't update product availability`, err);
  }
  getIO()?.emit("order:created", { orderId: order.id, orderNumber: order.orderNumber });
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
  // Once the order is flagged for staff (a wrong amount was paid), PayMongo isn't asked again.
  if (payment && payment.status === "pending" && payment.method === "qrph" && payment.reference && !order.stockIssue && isPaymongoConfigured()) {
    const intent = await getPaymentIntent(payment.reference);
    if (intent.status === "succeeded") {
      await recordOnlinePayment(order, intent.amountCentavos, payment.reference, { paidAt: new Date() }, { method: "qrph", paidAt: new Date() });
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
    // Not a refunded one either: a late or repeated event mustn't undo the refund.
    const result = await db.payment.updateMany({
      where: { orderId: order.id, status: { notIn: ["paid", "refunded"] } },
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

/** How the customer paid at the counter (the light POS): cash, or GCash / Maya recorded by hand. */
export interface CounterPaymentInput {
  method: "cash" | "gcash" | "maya";
  /** The e-wallet's reference number, from the customer's phone. */
  reference?: string;
  /** Cash handed over, for the change on the receipt. */
  amountTendered?: number;
}

const WALLET_NAME = { gcash: "GCash", maya: "Maya" } as const;

/**
 * Staff take payment for a counter order. Marking it paid, deducting every unit and raw
 * material it needs, confirming the order and sending it to the kitchen happen in one
 * transaction: if anything is short, StockShortageError (409) rolls it all back, so
 * nothing is deducted, the order stays unpaid, and staff can change it with the customer.
 * Cash is recorded as a counter payment with the amount handed over (it must cover the
 * total); GCash and Maya, paid to the shop's own account, with their reference number,
 * which can be used once.
 */
export async function confirmCounterPayment(orderId: string, payment: CounterPaymentInput = { method: "cash" }) {
  const order = await loadPayableOrder(orderId);

  if (payment.method === "cash" && payment.amountTendered !== undefined && payment.amountTendered < Number(order.totalAmount)) {
    throw new HttpError(400, `The cash received is less than the total of ₱${Number(order.totalAmount).toFixed(2)}`);
  }
  if (payment.reference) {
    const used = await prisma.payment.findFirst({ where: { reference: payment.reference }, include: { order: { select: { orderNumber: true } } } });
    if (used) throw new HttpError(409, `That reference number is already recorded for ${used.order.orderNumber}. Check it with the customer.`);
  }
  const paid = {
    method: payment.method === "cash" ? ("counter" as const) : payment.method,
    reference: payment.method === "cash" ? undefined : payment.reference,
    amountTendered: payment.method === "cash" ? payment.amountTendered : undefined,
    paidAt: new Date(),
  };

  const touched = await prisma
    .$transaction(async (tx) => {
      const applied = await markPaymentPaidIfNotAlready(tx, order, paid, paid);
      if (!applied) throw new HttpError(409, "Order is already paid");

      const touched = await deductStockForOrder(tx, order.id);
      await confirmPendingOrder(tx, order.id);
      await createKitchenTasksForOrder(tx, order.id);
      return touched;
    })
    .catch((err) => {
      if (err instanceof OrderCancelledError) throw new HttpError(409, cancelledMessage(order.orderNumber));
      // Another payment took the same reference number in the meantime.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError(409, `That ${WALLET_NAME[payment.method as "gcash" | "maya"] ?? ""} reference number is already recorded. Check it with the customer.`);
      }
      throw err;
    });

  await announcePaidOrder(order, touched);
  return getOrderById(order.id);
}

type OrderWithPayment = Prisma.OrderGetPayload<{ include: { payment: true } }>;

/**
 * Records a payment PayMongo has taken: marks it paid, deducts the stock, confirms the
 * order and sends it to the kitchen, all or nothing. Shared by the webhook and the
 * kiosk's status check, so whichever arrives first does the work and the other changes
 * nothing. A paid amount that isn't the order's total confirms nothing and is left to
 * staff. When the order was cancelled meanwhile, or stock ran out, the money is recorded
 * but nothing goes to the kitchen, and the order is flagged for staff.
 */
async function recordOnlinePayment(
  order: OrderWithPayment,
  paidCentavos: number,
  reference: string | null,
  paymentUpdate: Omit<Prisma.PaymentUpdateManyMutationInput, "status">,
  paymentCreate: Omit<Prisma.PaymentUncheckedCreateInput, "orderId" | "status" | "amount">
) {
  // The QR Ph code was made for the order's total.
  if (paidCentavos !== totalCentavos(order)) {
    await flagForStaff(order, wrongAmountNote(paidCentavos, order, reference));
    return;
  }

  try {
    const touched = await prisma.$transaction(async (tx) => {
      const applied = await markPaymentPaidIfNotAlready(tx, order, paymentUpdate, paymentCreate);
      if (!applied) return null; // already processed (gateway retry / duplicate delivery)

      const touched = await deductStockForOrder(tx, order.id);
      await confirmPendingOrder(tx, order.id);
      await createKitchenTasksForOrder(tx, order.id);
      return touched;
    });
    if (touched) await announcePaidOrder(order, touched);
  } catch (err) {
    // The money was taken, so this can't be refused like a counter order: record the
    // payment, deduct nothing (stock never goes negative), create no kitchen tasks, and
    // flag the order so staff refund the customer or substitute. A cancellation means
    // staff cancelled the order while the customer was paying.
    const note =
      err instanceof OrderCancelledError
        ? "Paid online after this order was cancelled. Refund the customer, or place the order again."
        : err instanceof StockShortageError
          ? `Paid online, but the stock ran out, so nothing was sent to the kitchen. ${err.message} Offer the customer a substitute or a refund.`
          : null;
    if (note === null) throw err;
    // Together, or PayMongo's retry would find it paid, with nobody told about it.
    const flagged = await prisma.$transaction(
      async (tx) => (await markPaymentPaidIfNotAlready(tx, order, paymentUpdate, paymentCreate)) && addNoteForStaff(tx, order.id, note)
    );
    if (flagged) announceNote(order, note);
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

  // An earlier QR Ph code stays payable at PayMongo after the kiosk shows a new one or
  // switches to paying at the counter (a phone may have saved it). If the order is already
  // paid by another means or another code, this is a second payment: flag it for a refund.
  // A repeat of the event that paid the order (same QR Ph code) changes nothing, also
  // once it has been refunded.
  if (order.payment.status === "paid" || order.payment.status === "refunded") {
    const sameCode = order.payment.method === "qrph" && order.payment.reference === event.paymentIntentId;
    if (event.paymentIntentId && !sameCode) {
      const amount = event.amountCentavos === null ? "A second payment" : `A second payment of ${pesos(event.amountCentavos)}`;
      await flagForStaff(order, `${amount} arrived online after this order was already paid${paymongoCode(event.paymentIntentId)}. Refund the customer.`);
    }
    return;
  }

  // The amount paid must match the order's total before anything is confirmed. A payment.paid
  // event carries it; if one doesn't, PayMongo is asked for the Payment Intent. An event with
  // no way to know the amount (the hosted checkout of earlier versions) is never confirmed.
  let paidCentavos = event.amountCentavos;
  if (paidCentavos === null && event.paymentIntentId && isPaymongoConfigured()) {
    const intent = await getPaymentIntent(event.paymentIntentId);
    if (intent.status === "succeeded") paidCentavos = intent.amountCentavos;
  }
  if (paidCentavos === null) {
    await flagForStaff(
      order,
      `PayMongo reported a payment without its amount, so it wasn't confirmed${paymongoCode(event.paymentIntentId)}. Check the amount in PayMongo's dashboard, then confirm the order at the counter or refund the customer.`
    );
    return;
  }

  // A QR Ph payment records which code paid and that it was QR Ph, even if the kiosk had
  // switched the order to the counter meanwhile. Other events leave `method` as it is: the
  // row already has the right value.
  const qrPh = event.type === "payment.paid" && event.paymentIntentId ? { method: "qrph" as const, reference: event.paymentIntentId } : {};
  await recordOnlinePayment(
    order,
    paidCentavos,
    event.paymentIntentId,
    { paidAt: new Date(), gatewayPayload: JSON.parse(rawBody.toString("utf8")), ...qrPh },
    { method: order.payment.method, paidAt: new Date() }
  );
}

