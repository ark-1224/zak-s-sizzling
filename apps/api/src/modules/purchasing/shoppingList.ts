import type { ShoppingListDTO, ShoppingListItemDTO, StorageType } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { flowFor, stockFlows } from "../inventory/flows";
import { itemKey, listStockItems, manilaDay, startOfManilaDay } from "./stockItems";

// The shopping list for the next market trip (Bautista & Young's re-order template, with
// the palengke's trip interval in place of a supplier's lead time). For each item:
//   usage per day   = what sales and waste used over the last USAGE_WINDOW_DAYS
//   days to cover   = days until the next trip, or fewer if it won't stay fresh that long
//   target          = usage per day × days to cover + safety stock, but never above par
//   buy             = target − on hand, rounded up to whole market units
// A fixed rule over recent usage, not a forecast (Limitations).

export const USAGE_WINDOW_DAYS = 28;

export interface PlanInput {
  onHand: number;
  avgDailyUsage: number;
  days: number;
  safetyStock: number | null;
  parLevel: number | null;
  shelfLifeDays: number | null;
  storage: StorageType | null;
  wholePieces: boolean;
  /** The unit to buy in (name and size in base units). */
  unit: { name: string; qtyInBase: number };
}

export interface Plan {
  coverDays: number;
  shortShelfLife: boolean;
  targetQty: number;
  buyBase: number;
  buyUnits: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function planPurchase(i: PlanInput): Plan {
  // Frozen stock keeps; anything else bought for longer than it stays fresh would spoil.
  const shortShelfLife = i.shelfLifeDays !== null && i.storage !== "frozen" && i.shelfLifeDays < i.days;
  const coverDays = shortShelfLife ? i.shelfLifeDays! : i.days;
  const need = i.avgDailyUsage * coverDays + (i.safetyStock ?? 0);
  const targetQty = round3(i.parLevel !== null ? Math.min(need, i.parLevel) : need);
  let buyBase = Math.max(0, targetQty - i.onHand);
  if (i.wholePieces) buyBase = Math.ceil(buyBase - 1e-9);
  buyBase = round3(buyBase);
  const buyUnits = buyBase > 0 ? Math.ceil(buyBase / i.unit.qtyInBase - 1e-9) : 0;
  return { coverDays, shortShelfLife, targetQty, buyBase, buyUnits };
}

export async function getShoppingList(days: number, now = new Date()): Promise<ShoppingListDTO> {
  const items = await listStockItems();
  const to = startOfManilaDay(manilaDay(new Date(now.getTime() + 24 * 60 * 60 * 1000)));
  const from = new Date(to.getTime() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const flows = await stockFlows(from, to);

  // The last price paid per item and unit, from the most recent purchases.
  const recent = await prisma.purchaseLine.findMany({
    where: { qtyUnits: { gt: 0 }, lineTotal: { gt: 0 } },
    select: { rawMaterialId: true, productId: true, unitName: true, qtyUnits: true, lineTotal: true },
    orderBy: [{ purchase: { purchasedOn: "desc" } }, { purchase: { createdAt: "desc" } }],
    take: 2000,
  });
  const lastUnit = new Map<string, string>();
  const lastPrice = new Map<string, number>();
  for (const l of recent) {
    const key = l.rawMaterialId ? itemKey("raw_material", l.rawMaterialId) : itemKey("ready_made", l.productId!);
    if (!lastUnit.has(key)) lastUnit.set(key, l.unitName);
    const priceKey = `${key}|${l.unitName.toLowerCase()}`;
    if (!lastPrice.has(priceKey)) lastPrice.set(priceKey, Number(l.lineTotal) / Number(l.qtyUnits));
  }

  const out: ShoppingListItemDTO[] = [];
  for (const item of items) {
    const key = itemKey(item.kind, item.itemId);
    const flow = flowFor(flows, key);
    const avgDailyUsage = round3(Math.max(0, flow.sold + flow.wasted) / USAGE_WINDOW_DAYS);
    if (avgDailyUsage === 0 && item.parLevel === null && item.safetyStock === null) continue;

    const units = [{ name: item.baseUnit as string, qtyInBase: 1 }, ...item.units];
    const lastName = lastUnit.get(key)?.toLowerCase();
    const unit = units.find((u) => u.name.toLowerCase() === lastName) ?? item.units[0] ?? units[0];
    const plan = planPurchase({
      onHand: item.onHand,
      avgDailyUsage,
      days,
      safetyStock: item.safetyStock,
      parLevel: item.parLevel,
      shelfLifeDays: item.shelfLifeDays,
      storage: item.storage,
      wholePieces: item.kind === "ready_made",
      unit,
    });
    if (plan.buyBase <= 0) continue;

    const known = lastPrice.get(`${key}|${unit.name.toLowerCase()}`);
    const lastPricePerUnit = known ?? (item.costPerBase !== null ? item.costPerBase * unit.qtyInBase : null);
    out.push({
      kind: item.kind,
      itemId: item.itemId,
      itemName: item.name,
      baseUnit: item.baseUnit,
      onHand: item.onHand,
      avgDailyUsage,
      coverDays: plan.coverDays,
      safetyStock: item.safetyStock ?? 0,
      parLevel: item.parLevel,
      targetQty: plan.targetQty,
      buyBase: plan.buyBase,
      unitName: unit.name,
      unitQtyInBase: unit.qtyInBase,
      buyUnits: plan.buyUnits,
      lastPricePerUnit: lastPricePerUnit === null ? null : Math.round(lastPricePerUnit * 100) / 100,
      estimatedCost: lastPricePerUnit === null ? null : Math.round(lastPricePerUnit * plan.buyUnits * 100) / 100,
      shortShelfLife: plan.shortShelfLife,
      shelfLifeDays: item.shelfLifeDays,
    });
  }
  return {
    days,
    usageWindowDays: USAGE_WINDOW_DAYS,
    items: out,
    estimatedTotal: Math.round(out.reduce((sum, i) => sum + (i.estimatedCost ?? 0), 0) * 100) / 100,
    itemsWithoutPrice: out.filter((i) => i.estimatedCost === null).length,
  };
}
