import { prisma } from "../../lib/prisma";
import type { InventoryMovementPoint, SalesReportPoint, TopProductPoint } from "@zaks/shared-types";

// "Confirmed+" = payment succeeded and the order is real (excludes abandoned carts
// that never got paid, and cancellations).
const PAID_STATUSES = ["confirmed", "preparing", "ready", "completed"] as const;

function bucketKey(date: Date, range: "daily" | "weekly" | "monthly"): string {
  if (range === "monthly") return date.toISOString().slice(0, 7); // YYYY-MM
  if (range === "weekly") {
    // ISO week key: Thursday of the week's year + week number.
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function rangeWindowDays(range: "daily" | "weekly" | "monthly"): number {
  if (range === "monthly") return 180; // ~6 months
  if (range === "weekly") return 56; // 8 weeks
  return 14; // 2 weeks
}

export async function getSalesReport(range: "daily" | "weekly" | "monthly"): Promise<SalesReportPoint[]> {
  const since = new Date(Date.now() - rangeWindowDays(range) * 86400000);
  const orders = await prisma.order.findMany({
    where: { status: { in: [...PAID_STATUSES] }, createdAt: { gte: since } },
    select: { createdAt: true, totalAmount: true },
  });

  const buckets = new Map<string, { orderCount: number; revenue: number }>();
  for (const o of orders) {
    const key = bucketKey(o.createdAt, range);
    const entry = buckets.get(key) ?? { orderCount: 0, revenue: 0 };
    entry.orderCount += 1;
    entry.revenue += Number(o.totalAmount);
    buckets.set(key, entry);
  }

  return Array.from(buckets.entries())
    .map(([bucket, v]) => ({ bucket, ...v }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export async function getTopProducts(limit = 10): Promise<TopProductPoint[]> {
  const items = await prisma.orderItem.findMany({
    where: { order: { status: { in: [...PAID_STATUSES] } } },
    select: { qty: true, subtotal: true, product: { select: { id: true, name: true } } },
  });

  const byProduct = new Map<string, TopProductPoint>();
  for (const item of items) {
    const entry = byProduct.get(item.product.id) ?? {
      productId: item.product.id,
      productName: item.product.name,
      qtySold: 0,
      revenue: 0,
    };
    entry.qtySold += item.qty;
    entry.revenue += Number(item.subtotal);
    byProduct.set(item.product.id, entry);
  }

  return Array.from(byProduct.values())
    .sort((a, b) => b.qtySold - a.qtySold)
    .slice(0, limit);
}

/** "Movement" = units sold in the window, paired with current stock. There's no
 *  dedicated stock-ledger table in this schema (Sprint 4 tracks current stock only,
 *  not a history of every adjustment) — this derives movement from confirmed order
 *  items instead, which covers the sales-driven side of movement, not manual
 *  adjustments/corrections. A real audit-log table would be the next step if this
 *  needs to capture stock corrections too. */
export async function getInventoryMovement(): Promise<InventoryMovementPoint[]> {
  const [topProducts, products] = await Promise.all([
    getTopProducts(1000),
    prisma.product.findMany({ select: { id: true, name: true, inventory: { select: { stockQty: true } } } }),
  ]);

  const stockByProduct = new Map(products.map((p) => [p.id, p.inventory?.stockQty ?? null]));
  const sold = new Map(topProducts.map((p) => [p.productId, p.qtySold]));

  return products
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      qtySold: sold.get(p.id) ?? 0,
      currentStock: stockByProduct.get(p.id) ?? null,
    }))
    .sort((a, b) => b.qtySold - a.qtySold);
}
