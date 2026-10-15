import type { Prisma } from "@prisma/client";
import type { PrepEstimate } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";

/**
 * Estimated preparation time for an order (Scope, Payment Transaction; Sprint 3).
 *
 * The kitchen cooks an order's dishes side by side, so the longest dish sets the pace.
 * Each serving after the first adds a little plating time, and each order already in
 * the kitchen ahead of this one adds a little queue time:
 *
 *   estimate = longest prep time + 1 min × (servings − 1) + 2 min × orders ahead
 *
 * Items with a prep time of 0 (served as they are, such as bottled drinks) don't count
 * as servings, and an order of only such items is ready right away (0 minutes), without
 * waiting behind the kitchen queue.
 */
export const EXTRA_SERVING_MINUTES = 1;
export const ORDER_AHEAD_MINUTES = 2;

export interface PrepLine {
  prepMinutes: number;
  qty: number;
}

export function estimatePrepMinutes(lines: PrepLine[], ordersAhead: number): number {
  const cooked = lines.filter((line) => line.prepMinutes > 0 && line.qty > 0);
  if (cooked.length === 0) return 0;
  const longest = Math.max(...cooked.map((line) => line.prepMinutes));
  const servings = cooked.reduce((sum, line) => sum + line.qty, 0);
  return longest + EXTRA_SERVING_MINUTES * (servings - 1) + ORDER_AHEAD_MINUTES * Math.max(0, ordersAhead);
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Orders in the kitchen right now (at least one dish not yet done), other than `excludeOrderId`. */
export function countOrdersInKitchen(excludeOrderId?: string, db: Db = prisma): Promise<number> {
  return db.order.count({
    where: {
      id: excludeOrderId ? { not: excludeOrderId } : undefined,
      items: { some: { kitchenTask: { status: { not: "completed" } } } },
    },
  });
}

/** The estimate for a cart at checkout, before any order exists: same formula, same queue. */
export async function estimateForCart(items: { productId: string; qty: number }[]): Promise<PrepEstimate> {
  const ids = [...new Set(items.map((item) => item.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, prepMinutes: true } });
  if (products.length !== ids.length) throw new HttpError(404, "One of the products in the order doesn't exist");
  const prepById = new Map(products.map((p) => [p.id, p.prepMinutes]));
  const ordersAhead = await countOrdersInKitchen();
  return {
    estimatedPrepMinutes: estimatePrepMinutes(
      items.map((item) => ({ qty: item.qty, prepMinutes: prepById.get(item.productId)! })),
      ordersAhead
    ),
    ordersAhead,
  };
}

/**
 * Works the order's estimate out again now that it has reached the kitchen, and sets
 * when it should be ready. The estimate shown at checkout used the queue at that
 * moment; for a counter order the customer may pay much later.
 */
export async function setEstimateOnReachingKitchen(orderId: string, now = new Date()): Promise<void> {
  const items = await prisma.orderItem.findMany({ where: { orderId }, select: { qty: true, product: { select: { prepMinutes: true } } } });
  const minutes = estimatePrepMinutes(
    items.map((item) => ({ qty: item.qty, prepMinutes: item.product.prepMinutes })),
    await countOrdersInKitchen(orderId)
  );
  await prisma.order.update({
    where: { id: orderId },
    data: { estimatedPrepMinutes: minutes, estimatedReadyAt: new Date(now.getTime() + minutes * 60_000) },
  });
}
