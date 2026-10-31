import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { isPaymongoConfigured } from "../../lib/paymongo";
import { HttpError } from "../../middleware/errorHandler";
import { emitOrdersChanged } from "../../websocket";
import { assertStockForNewOrder, PRODUCT_STOCK_INCLUDE } from "../inventory/fulfillment";
import { countOrdersInKitchen, estimatePrepMinutes } from "./prepTime";
import type { OrderBoardDTO, OrderDTO, TransactionDTO, TransactionPageDTO } from "@zaks/shared-types";
import type { z } from "zod";
import type { transactionQuerySchema } from "./schema";

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { items: { include: { product: true } }; payment: true };
}>;

export function toOrderDTO(order: OrderWithRelations): OrderDTO {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    orderType: order.orderType,
    totalAmount: Number(order.totalAmount),
    stockIssue: order.stockIssue,
    stockIssueNote: order.stockIssueNote,
    estimatedPrepMinutes: order.estimatedPrepMinutes,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      productIcon: item.product.icon,
      qty: item.qty,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      specialInstructions: item.specialInstructions,
    })),
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
          amount: Number(order.payment.amount),
          reference: order.payment.reference,
          paidAt: order.payment.paidAt?.toISOString() ?? null,
        }
      : null,
  };
}

interface CreateOrderInput {
  items: { productId: string; qty: number; specialInstructions?: string }[];
  customerName?: string;
  kioskSessionId?: string;
  paymentMethod?: "counter" | "qrph";
  orderType?: "dine_in" | "take_out";
}

const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function generateOrderNumber(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  return `ZK-${code}`;
}

export async function createOrder(input: CreateOrderInput) {
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: PRODUCT_STOCK_INCLUDE,
  });

  const productById = new Map(products.map((p) => [p.id, p]));
  for (const item of input.items) {
    const product = productById.get(item.productId);
    if (!product) throw new HttpError(404, `Product ${item.productId} not found`);
    if (!product.isAvailable) throw new HttpError(409, `${product.name} is currently unavailable`);
  }
  // isAvailable only means "at least one in stock" — it doesn't guarantee enough for
  // THIS order, and dishes sharing a raw material compete for it. This is the up-front
  // rejection, so a customer doesn't check out something that can't be made; the
  // deduction at payment confirmation (fulfillment.ts) is what enforces it atomically
  // against concurrent orders.
  assertStockForNewOrder(input.items.map((item) => ({ qty: item.qty, product: productById.get(item.productId)! })));

  const lines = input.items.map((item) => {
    const product = productById.get(item.productId)!;
    const unitPrice = product.price;
    const subtotal = unitPrice.mul(item.qty);
    return {
      productId: item.productId,
      qty: item.qty,
      unitPrice,
      subtotal,
      specialInstructions: item.specialInstructions,
    };
  });

  const totalAmount = lines.reduce((sum, l) => sum.add(l.subtotal), new Prisma.Decimal(0));
  // Shown on the receipt; worked out again when the order reaches the kitchen (prepTime.ts).
  const estimatedPrepMinutes = estimatePrepMinutes(
    input.items.map((item) => ({ qty: item.qty, prepMinutes: productById.get(item.productId)!.prepMinutes })),
    await countOrdersInKitchen()
  );
  // Without PayMongo, QR Ph can't be paid, so such an order is a counter order
  // from the start and the payment queue labels it that way (UI review #2).
  const paymentMethod = input.paymentMethod && input.paymentMethod !== "counter" && !isPaymongoConfigured() ? "counter" : input.paymentMethod;

  // Order numbers are short and random — retry a few times on the rare collision
  // rather than serializing order creation behind a counter.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerName: input.customerName,
          kioskSessionId: input.kioskSessionId,
          orderType: input.orderType,
          totalAmount,
          estimatedPrepMinutes,
          items: { create: lines },
          // Recording the intended method as a `pending` payment as soon as the order
          // exists (rather than only once it's paid) means the receipt screen and the
          // staff orders queue always have a payment record to read from — never null.
          payment: paymentMethod ? { create: { method: paymentMethod, status: "pending", amount: totalAmount } } : undefined,
        },
        include: { items: { include: { product: true } }, payment: true },
      });
      emitOrdersChanged();
      return toOrderDTO(order);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new HttpError(500, "Could not generate a unique order number, please retry");
}

export async function getOrderById(id: string): Promise<OrderDTO | null> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, payment: true },
  });
  return order ? toOrderDTO(order) : null;
}

/**
 * kioskSessionId isn't part of OrderDTO (no reason to expose it to every caller), so
 * route handlers that need to check order ownership for an anonymous kiosk session
 * ask for it separately rather than it leaking into the public response shape.
 */
export async function getOrderOwnerSessionId(id: string): Promise<string | null | undefined> {
  const order = await prisma.order.findUnique({ where: { id }, select: { kioskSessionId: true } });
  return order?.kioskSessionId;
}

// Orders older than this drop off the board, and ready ones off the kitchen display
// (kitchen/service.ts), even if nobody pressed Handed over.
export const BOARD_WINDOW_MS = 12 * 60 * 60 * 1000;
const BOARD_LIMIT = 30;

/**
 * The status board on the counter screen: order numbers of paid orders the kitchen is
 * preparing, and of orders ready to collect. No login, so it returns order numbers only.
 */
export async function getOrderBoard(): Promise<OrderBoardDTO> {
  const since = new Date(Date.now() - BOARD_WINDOW_MS);
  const [preparing, ready] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: ["confirmed", "preparing"] }, createdAt: { gte: since } },
      select: { orderNumber: true },
      orderBy: { createdAt: "asc" },
      take: BOARD_LIMIT,
    }),
    prisma.order.findMany({
      where: { status: "ready", createdAt: { gte: since } },
      select: { orderNumber: true },
      orderBy: { updatedAt: "desc" },
      take: BOARD_LIMIT,
    }),
  ]);
  return { preparing: preparing.map((o) => o.orderNumber), ready: ready.map((o) => o.orderNumber) };
}

const PAID_STATUSES = ["confirmed", "preparing", "ready", "completed"] as const;

/** Today's date in Manila (YYYY-MM-DD), where the restaurant is. */
function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/** From the start of `from` to the end of `to`, Manila time (UTC+8, no daylight saving). */
function manilaRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+08:00`);
  const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}

/** "zk ltly9n", "ZK-LTLY9N" and "ltly9n" all search for LTLY9N in the order number. */
function orderNumberSearch(q: string | undefined): string | null {
  const letters = (q ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const code = letters.startsWith("ZK") ? letters.slice(2) : letters;
  return code || null;
}

/**
 * The transaction history for the Administrator: every order in a date range (today by
 * default), newest first, filtered by status, payment method, paid or unpaid, and order
 * number, a page at a time. Totals cover every matching order, not just the page; sales
 * count paid orders only (confirmed to completed), as the analytics do.
 */
export async function listTransactions(query: z.infer<typeof transactionQuerySchema>): Promise<TransactionPageDTO> {
  const today = manilaToday();
  // Only a start date: up to today. Only an end date: that one day.
  const from = query.from ?? query.to ?? today;
  const to = query.to ?? (from > today ? from : today);
  const code = orderNumberSearch(query.q);

  const where: Prisma.OrderWhereInput = {
    createdAt: manilaRange(from, to),
    ...(query.status ? { status: query.status } : {}),
    ...(code ? { orderNumber: { contains: code, mode: "insensitive" } } : {}),
    AND: [
      ...(query.method ? [{ payment: { method: query.method } }] : []),
      ...(query.paid === "paid" ? [{ payment: { status: "paid" as const } }] : []),
      ...(query.paid === "unpaid" ? [{ OR: [{ payment: null }, { payment: { status: { not: "paid" as const } } }] }] : []),
    ],
  };

  const [total, paid, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.aggregate({
      where: { AND: [where, { status: { in: [...PAID_STATUSES] } }, { payment: { status: "paid" } }] },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.order.findMany({
      where,
      include: { items: { include: { product: true, kitchenTask: true } }, payment: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const sales = Number(paid._sum.totalAmount ?? 0);
  const paidCount = paid._count._all;
  return {
    orders: orders.map(toTransactionDTO),
    page: query.page,
    pageSize: query.pageSize,
    total,
    paidCount,
    sales,
    averageOrderValue: paidCount > 0 ? Math.round((sales / paidCount) * 100) / 100 : null,
    from,
    to,
  };
}

type OrderWithTasks = Prisma.OrderGetPayload<{
  include: { items: { include: { product: true; kitchenTask: true } }; payment: true };
}>;

/**
 * An order plus when it reached each step. Preparing and ready come from the kitchen's
 * dish times; handed over and cancelled are recorded when they happen.
 */
function toTransactionDTO(order: OrderWithTasks): TransactionDTO {
  const tasks = order.items.flatMap((item) => (item.kitchenTask ? [item.kitchenTask] : []));
  const times = (pick: (t: (typeof tasks)[number]) => Date | null) =>
    tasks.map(pick).filter((d): d is Date => d !== null).map((d) => d.getTime());
  const started = times((t) => t.startedAt);
  const finished = times((t) => t.completedAt);
  const reachedReady = order.status === "ready" || order.status === "completed";
  return {
    ...toOrderDTO(order),
    timeline: {
      placedAt: order.createdAt.toISOString(),
      paidAt: order.payment?.paidAt?.toISOString() ?? null,
      preparingAt: started.length > 0 ? new Date(Math.min(...started)).toISOString() : null,
      readyAt: reachedReady && finished.length > 0 ? new Date(Math.max(...finished)).toISOString() : null,
      // Orders from before these times were recorded fall back to their last change.
      handedOverAt: order.status === "completed" ? (order.handedOverAt ?? order.updatedAt).toISOString() : null,
      cancelledAt: order.status === "cancelled" ? (order.cancelledAt ?? order.updatedAt).toISOString() : null,
    },
  };
}

/** Staff/admin order oversight — e.g. the counter-payment queue on /staff/orders. */
export async function listOrders(filter: { unpaidCounterOnly?: boolean } = {}): Promise<OrderDTO[]> {
  const orders = await prisma.order.findMany({
    // Unpaid orders that weren't cancelled, plus paid orders flagged with a stock issue:
    // staff still have to act on those.
    where: filter.unpaidCounterOnly
      ? {
          OR: [
            { status: { not: "cancelled" }, OR: [{ payment: null }, { payment: { status: { not: "paid" } } }] },
            { stockIssue: true },
          ],
        }
      : undefined,
    include: { items: { include: { product: true } }, payment: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return orders.map(toOrderDTO);
}

/**
 * Cancels an order nobody paid for, e.g. a kiosk customer who never came to the counter
 * or left the online payment page (UI review #15). An unpaid order has deducted no stock
 * and sent nothing to the kitchen, so there is nothing to give back. It is one
 * conditional update, so an order that gets paid at the same moment is never cancelled;
 * payment confirmation in turn refuses a cancelled order (payments/service.ts).
 */
export async function cancelOrder(id: string): Promise<OrderDTO> {
  const result = await prisma.order.updateMany({
    where: { id, status: "pending", OR: [{ payment: null }, { payment: { status: { not: "paid" } } }] },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  if (result.count === 0) {
    const order = await prisma.order.findUnique({ where: { id }, select: { orderNumber: true, status: true } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status === "cancelled") throw new HttpError(409, `${order.orderNumber} is already cancelled`);
    throw new HttpError(409, `${order.orderNumber} is already paid, so it can't be cancelled`);
  }
  emitOrdersChanged();
  return (await getOrderById(id))!;
}

/**
 * Staff have dealt with an order that needed attention (refunded, substituted, collected
 * the difference): it leaves the payment queue. The note stays, so the transaction
 * history still shows what happened. One conditional update, so a second click says so.
 */
export async function markAttentionSortedOut(id: string): Promise<OrderDTO> {
  const result = await prisma.order.updateMany({ where: { id, stockIssue: true }, data: { stockIssue: false } });
  if (result.count === 0) {
    const order = await prisma.order.findUnique({ where: { id }, select: { orderNumber: true } });
    if (!order) throw new HttpError(404, "Order not found");
    throw new HttpError(409, `${order.orderNumber} doesn't need attention any more`);
  }
  emitOrdersChanged();
  return (await getOrderById(id))!;
}
