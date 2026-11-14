import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { PriceHistoryDTO, PurchaseDTO, StockItemKind } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { refreshAvailability } from "../inventory/fulfillment";
import type { createPurchaseSchema, purchaseListQuerySchema } from "./schema";
import { dateOnly, getStockItem, itemKey, manilaDay, type StockItem } from "./stockItems";

// Market purchases (the palengke trips). The owner enters each resibo after the trip:
// every line adds its stock (logged as a restock, linked to the purchase), and the price
// paid becomes the item's cost per unit, so recipe costs and food cost follow the market.
// A purchase isn't edited afterwards; a mistake is corrected with a stock adjustment.

type CreatePurchase = z.infer<typeof createPurchaseSchema>;
type Decimal = Prisma.Decimal;
const D = (n: number | Decimal) => new Prisma.Decimal(n);

const PURCHASE_INCLUDE = {
  createdBy: { select: { name: true } },
  lines: {
    include: { rawMaterial: { select: { name: true, unit: true } }, product: { select: { name: true } } },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.PurchaseInclude;
type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

function toPurchaseDTO(p: PurchaseRow): PurchaseDTO {
  return {
    id: p.id,
    purchasedOn: dateOnly(p.purchasedOn),
    kind: p.kind,
    store: p.store,
    note: p.note,
    totalAmount: Number(p.totalAmount),
    createdByName: p.createdBy.name,
    createdAt: p.createdAt.toISOString(),
    lines: p.lines.map((l) => ({
      id: l.id,
      kind: l.rawMaterialId ? "raw_material" : "ready_made",
      itemId: (l.rawMaterialId ?? l.productId)!,
      itemName: l.rawMaterial?.name ?? l.product?.name ?? "",
      baseUnit: l.rawMaterial?.unit ?? "pc",
      unitName: l.unitName,
      unitQtyInBase: Number(l.unitQtyInBase),
      qtyUnits: Number(l.qtyUnits),
      qtyBase: Number(l.qtyBase),
      lineTotal: Number(l.lineTotal),
      pricePerUnit: Number(l.qtyUnits) > 0 ? Number(l.lineTotal.div(l.qtyUnits).toDecimalPlaces(2)) : null,
      plannedUnits: l.plannedUnits === null ? null : Number(l.plannedUnits),
      expiresOn: l.expiresOn ? dateOnly(l.expiresOn) : null,
    })),
  };
}

/** The unit a line was bought in: one of the item's market units, or its base unit (size 1). */
export function resolveUnit(item: Pick<StockItem, "name" | "baseUnit" | "units">, unitName: string): { name: string; qtyInBase: number } {
  const wanted = unitName.trim().toLowerCase();
  if (wanted === item.baseUnit) return { name: item.baseUnit, qtyInBase: 1 };
  const unit = item.units.find((u) => u.name.toLowerCase() === wanted);
  if (!unit) throw new HttpError(400, `${item.name} has no market unit "${unitName}". Add it in the item's form, or use ${item.baseUnit}`);
  return unit;
}

export async function createPurchase(input: CreatePurchase, userId: string): Promise<PurchaseDTO> {
  if (input.purchasedOn > manilaDay(new Date())) throw new HttpError(400, "The purchase date can't be in the future");

  // Work out every line first, so a bad line saves nothing.
  const items = new Map<string, StockItem>();
  const lines: { item: StockItem; line: CreatePurchase["lines"][number]; size: number; qtyBase: Decimal; unitName: string }[] = [];
  for (const line of input.lines) {
    const key = itemKey(line.kind, line.itemId);
    const item = items.get(key) ?? (await getStockItem(line.kind, line.itemId));
    items.set(key, item);
    const { name: unitName, qtyInBase: size } = resolveUnit(item, line.unitName);
    const qtyBase = D(line.qtyUnits).mul(size).toDecimalPlaces(3);
    if (item.kind === "ready_made" && !qtyBase.isInteger()) {
      throw new HttpError(400, `${item.name} is counted in whole pieces: ${line.qtyUnits} ${line.unitName} is ${qtyBase.toString()} pieces`);
    }
    if (qtyBase.isZero() && line.lineTotal > 0) throw new HttpError(400, `${item.name}: a price was entered but nothing was bought`);
    lines.push({ item, line, size, qtyBase, unitName });
  }
  const total = lines.reduce((sum, l) => sum.add(l.line.lineTotal), D(0));

  const { purchase, touched } = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        purchasedOn: new Date(`${input.purchasedOn}T00:00:00Z`),
        kind: input.kind,
        store: input.store || null,
        note: input.note || null,
        totalAmount: total,
        createdById: userId,
        lines: {
          create: lines.map(({ item, line, size, qtyBase, unitName }) => ({
            ...(item.kind === "raw_material" ? { rawMaterialId: item.itemId } : { productId: item.itemId }),
            unitName,
            unitQtyInBase: D(size),
            qtyUnits: D(line.qtyUnits),
            qtyBase,
            lineTotal: D(line.lineTotal),
            plannedUnits: line.plannedUnits === undefined ? null : D(line.plannedUnits),
            expiresOn: line.expiresOn ? new Date(`${line.expiresOn}T00:00:00Z`) : null,
          })),
        },
      },
    });

    // Add the stock and the new price, per item (an item may be on two lines, e.g. two units).
    const byItem = new Map<string, { item: StockItem; qty: Decimal; paid: Decimal }>();
    for (const { item, qtyBase, line } of lines) {
      const key = itemKey(item.kind, item.itemId);
      const entry = byItem.get(key) ?? { item, qty: D(0), paid: D(0) };
      entry.qty = entry.qty.add(qtyBase);
      entry.paid = entry.paid.add(line.lineTotal);
      byItem.set(key, entry);
    }
    const note = `${input.kind === "top_up" ? "Top-up purchase" : "Market purchase"} on ${input.purchasedOn}`;
    const touched = { productIds: [] as string[], materialIds: [] as string[] };
    for (const { item, qty, paid } of [...byItem.values()].sort((a, b) => itemKey(a.item.kind, a.item.itemId).localeCompare(itemKey(b.item.kind, b.item.itemId)))) {
      if (qty.isZero()) continue;
      const costPerBase = paid.isZero() ? null : paid.div(qty);
      if (item.kind === "raw_material") {
        const row = await tx.rawMaterial.update({
          where: { id: item.itemId },
          data: { stockQty: { increment: qty }, ...(costPerBase ? { costPerUnit: costPerBase.toDecimalPlaces(4) } : {}) },
        });
        await tx.rawMaterialMovement.create({
          data: { rawMaterialId: item.itemId, delta: qty, previousQty: row.stockQty.sub(qty), newQty: row.stockQty, type: "restock", reason: "restock", note, purchaseId: purchase.id, adjustedById: userId },
        });
        touched.materialIds.push(item.itemId);
      } else {
        const pieces = qty.toNumber();
        const row = await tx.inventory.update({ where: { productId: item.itemId }, data: { stockQty: { increment: pieces } } });
        if (costPerBase) await tx.product.update({ where: { id: item.itemId }, data: { cost: costPerBase.toDecimalPlaces(2) } });
        await tx.stockAdjustment.create({
          data: { productId: item.itemId, delta: pieces, previousQty: row.stockQty - pieces, newQty: row.stockQty, reason: "restock", note, purchaseId: purchase.id, adjustedById: userId },
        });
        touched.productIds.push(item.itemId);
      }
    }
    return { purchase, touched };
  });

  await refreshAvailability(touched);
  return getPurchase(purchase.id);
}

export async function getPurchase(id: string): Promise<PurchaseDTO> {
  const purchase = await prisma.purchase.findUnique({ where: { id }, include: PURCHASE_INCLUDE });
  if (!purchase) throw new HttpError(404, "Purchase not found");
  return toPurchaseDTO(purchase);
}

export async function listPurchases(query: z.infer<typeof purchaseListQuerySchema>): Promise<PurchaseDTO[]> {
  const rows = await prisma.purchase.findMany({
    where: {
      purchasedOn: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
      },
    },
    include: PURCHASE_INCLUDE,
    orderBy: [{ purchasedOn: "desc" }, { createdAt: "desc" }],
    take: query.limit,
  });
  return rows.map(toPurchaseDTO);
}

/** What an item cost on each purchase, oldest first. */
export async function getPriceHistory(kind: StockItemKind, itemId: string): Promise<PriceHistoryDTO> {
  const item = await getStockItem(kind, itemId);
  const lines = await prisma.purchaseLine.findMany({
    where: { ...(kind === "raw_material" ? { rawMaterialId: itemId } : { productId: itemId }), qtyUnits: { gt: 0 }, lineTotal: { gt: 0 } },
    include: { purchase: { select: { purchasedOn: true, store: true, createdAt: true } } },
    orderBy: [{ purchase: { purchasedOn: "asc" } }, { purchase: { createdAt: "asc" } }],
  });
  return {
    kind,
    itemId,
    itemName: item.name,
    baseUnit: item.baseUnit,
    points: lines.map((l) => ({
      purchasedOn: dateOnly(l.purchase.purchasedOn),
      unitName: l.unitName,
      qtyUnits: Number(l.qtyUnits),
      lineTotal: Number(l.lineTotal),
      pricePerUnit: Number(l.lineTotal.div(l.qtyUnits).toDecimalPlaces(2)),
      pricePerBase: Number(l.lineTotal.div(l.qtyBase).toDecimalPlaces(4)),
      store: l.purchase.store,
    })),
  };
}
