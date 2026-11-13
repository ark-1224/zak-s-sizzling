import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../../lib/prisma";
import type { StockMovementDTO } from "@zaks/shared-types";
import type { stockMovementQuerySchema } from "./schema";

// The Stock movements tab on Raw materials: one log of every stock change, newest first,
// for raw materials and ready-made items (counted in pieces) together. Three sources:
// - raw material movements: sales deducted from recipes, restocks and adjustments;
// - stock adjustments of ready-made items: restocks, corrections and cancelled orders'
//   pieces put back, each with who did it and why;
// - ready-made items sold: the paid orders' lines (a sale takes pieces without a log row of
//   its own), dated when the order was paid. Their before/after counts aren't recorded.
// Each source is filtered the same way (item, kind of change, Manila dates), then merged.

type Query = z.infer<typeof stockMovementQuerySchema>;

/** From the start of `from` to the end of `to`, Manila time (UTC+8, no daylight saving). */
function manilaRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00+08:00`) } : {}),
    ...(to ? { lt: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000) } : {}),
  };
}

export async function listStockMovements(query: Query): Promise<StockMovementDTO[]> {
  const when = manilaRange(query.from, query.to);
  const wantMaterials = query.kind !== "ready_made";
  const wantReadyMade = query.kind !== "raw_material";
  const take = query.limit;

  const [materialRows, adjustmentRows, saleRows] = await Promise.all([
    wantMaterials
      ? prisma.rawMaterialMovement.findMany({
          where: {
            ...(query.itemId ? { rawMaterialId: query.itemId } : {}),
            ...(when ? { createdAt: when } : {}),
            ...(query.type === "sale"
              ? { type: "sale" }
              : query.type === "restock"
                ? { OR: [{ type: "restock" }, { reason: "restock" }] }
                : query.type === "adjustment"
                  ? { type: "adjustment", OR: [{ reason: null }, { reason: { not: "restock" } }] }
                  : {}),
          },
          include: { rawMaterial: { select: { name: true, unit: true } }, adjustedBy: { select: { name: true } }, order: { select: { orderNumber: true } } },
          orderBy: { createdAt: "desc" },
          take,
        })
      : [],
    wantReadyMade && query.type !== "sale"
      ? prisma.stockAdjustment.findMany({
          where: {
            ...(query.itemId ? { productId: query.itemId } : {}),
            ...(when ? { createdAt: when } : {}),
            ...(query.type === "restock" ? { reason: "restock" } : query.type === "adjustment" ? { reason: { not: "restock" } } : {}),
          },
          include: { product: { select: { name: true } }, adjustedBy: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take,
        })
      : [],
    wantReadyMade && (query.type === undefined || query.type === "sale")
      ? prisma.orderItem.findMany({
          where: {
            ...(query.itemId ? { productId: query.itemId } : {}),
            product: { tracking: "unit" },
            order: { payment: { paidAt: when ?? { not: null } } },
          },
          include: { product: { select: { name: true } }, order: { select: { orderNumber: true, payment: { select: { paidAt: true } } } } },
          orderBy: { order: { payment: { paidAt: "desc" } } },
          take,
        })
      : [],
  ]);

  const movements: StockMovementDTO[] = [
    ...materialRows.map((r) => ({
      id: `rm-${r.id}`,
      kind: "raw_material" as const,
      itemId: r.rawMaterialId,
      itemName: r.rawMaterial.name,
      unit: r.rawMaterial.unit,
      delta: Number(r.delta),
      previousQty: Number(r.previousQty),
      newQty: Number(r.newQty),
      type: r.type === "sale" ? ("sale" as const) : r.type === "restock" || r.reason === "restock" ? ("restock" as const) : ("adjustment" as const),
      reason: r.reason,
      note: r.note,
      orderNumber: r.order?.orderNumber ?? null,
      adjustedByName: r.adjustedBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    ...adjustmentRows.map((r) => ({
      id: `sa-${r.id}`,
      kind: "ready_made" as const,
      itemId: r.productId,
      itemName: r.product.name,
      unit: "pc" as const,
      delta: r.delta,
      previousQty: r.previousQty,
      newQty: r.newQty,
      type: r.reason === "restock" ? ("restock" as const) : ("adjustment" as const),
      reason: r.reason,
      note: r.note,
      orderNumber: null,
      adjustedByName: r.adjustedBy.name,
      createdAt: r.createdAt.toISOString(),
    })),
    ...saleRows.map((r) => ({
      id: `oi-${r.id}`,
      kind: "ready_made" as const,
      itemId: r.productId,
      itemName: r.product.name,
      unit: "pc" as const,
      delta: -r.qty,
      previousQty: null,
      newQty: null,
      type: "sale" as const,
      reason: null,
      note: null,
      orderNumber: r.order.orderNumber,
      adjustedByName: null,
      createdAt: r.order.payment!.paidAt!.toISOString(),
    })),
  ];

  return movements.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, take);
}
