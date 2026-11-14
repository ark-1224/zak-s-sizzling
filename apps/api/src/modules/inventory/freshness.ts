import type { FreshnessWarningDTO } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { addDays, dateOnly, daysBetween, itemKey, listStockItems, manilaDay } from "../purchasing/stockItems";

// Shelf-life warnings. Stock is one number per item, not batches (a stated limitation),
// so the age of what's on hand is estimated from the purchases: assuming the oldest stock
// is used first, what's on hand is the most recent purchases, and the oldest of those
// tells how old the stock is. An item goes off `shelfLifeDays` after it was bought (fresh
// goods have no printed date), or on a packaged item's printed expiry date.

export const USE_SOON_DAYS = { shelfLife: 2, printed: 7 } as const;

export interface PurchaseLot {
  /** YYYY-MM-DD */
  purchasedOn: string;
  qtyBase: number;
  expiresOn: string | null;
}

/** The purchases that make up what's on hand, newest first, assuming oldest is used first.
 *  If the purchases don't add up to what's on hand (stock from before purchases were
 *  recorded), all of them are on hand. */
export function lotsOnHand(onHand: number, lotsNewestFirst: PurchaseLot[]): PurchaseLot[] {
  const covering: PurchaseLot[] = [];
  let left = onHand;
  for (const lot of lotsNewestFirst) {
    if (left <= 0) break;
    if (lot.qtyBase <= 0) continue;
    covering.push(lot);
    left -= lot.qtyBase;
  }
  return covering;
}

export interface FreshnessInput {
  onHand: number;
  shelfLifeDays: number | null;
  storage: "frozen" | "chilled" | "room" | null;
  lotsNewestFirst: PurchaseLot[];
}

/** The earliest the stock on hand goes off, and why; null when nothing to warn about. */
export function freshnessOf(input: FreshnessInput, today: string): Pick<FreshnessWarningDTO, "status" | "basis" | "boughtOn" | "goesOffOn" | "daysLeft"> | null {
  if (input.onHand <= 0) return null;
  const lots = lotsOnHand(input.onHand, input.lotsNewestFirst);
  if (lots.length === 0) return null;
  const candidates: { basis: "shelf_life" | "printed_date"; goesOffOn: string; boughtOn: string | null; soon: number }[] = [];
  const oldest = lots[lots.length - 1];
  if (input.shelfLifeDays) {
    candidates.push({ basis: "shelf_life", goesOffOn: addDays(oldest.purchasedOn, input.shelfLifeDays), boughtOn: oldest.purchasedOn, soon: USE_SOON_DAYS.shelfLife });
  }
  const printed = lots.filter((l) => l.expiresOn).sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!))[0];
  if (printed) candidates.push({ basis: "printed_date", goesOffOn: printed.expiresOn!, boughtOn: printed.purchasedOn, soon: USE_SOON_DAYS.printed });

  const warnings = candidates
    .map((c) => ({ ...c, daysLeft: daysBetween(today, c.goesOffOn) }))
    .filter((c) => c.daysLeft <= c.soon)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const first = warnings[0];
  if (!first) return null;
  return { status: first.daysLeft < 0 ? "expired" : "use_soon", basis: first.basis, boughtOn: first.boughtOn, goesOffOn: first.goesOffOn, daysLeft: first.daysLeft };
}

/** Items to use soon or throw out, soonest first. */
export async function listFreshnessWarnings(now = new Date()): Promise<FreshnessWarningDTO[]> {
  const today = manilaDay(now);
  const items = (await listStockItems()).filter((i) => i.onHand > 0);
  if (items.length === 0) return [];
  const lines = await prisma.purchaseLine.findMany({
    where: {
      qtyBase: { gt: 0 },
      OR: [
        { rawMaterialId: { in: items.filter((i) => i.kind === "raw_material").map((i) => i.itemId) } },
        { productId: { in: items.filter((i) => i.kind === "ready_made").map((i) => i.itemId) } },
      ],
    },
    select: { rawMaterialId: true, productId: true, qtyBase: true, expiresOn: true, purchase: { select: { purchasedOn: true, createdAt: true } } },
    orderBy: [{ purchase: { purchasedOn: "desc" } }, { purchase: { createdAt: "desc" } }],
  });
  const lotsByItem = new Map<string, PurchaseLot[]>();
  for (const l of lines) {
    const key = l.rawMaterialId ? itemKey("raw_material", l.rawMaterialId) : itemKey("ready_made", l.productId!);
    const lots = lotsByItem.get(key) ?? lotsByItem.set(key, []).get(key)!;
    lots.push({ purchasedOn: dateOnly(l.purchase.purchasedOn), qtyBase: Number(l.qtyBase), expiresOn: l.expiresOn ? dateOnly(l.expiresOn) : null });
  }

  const warnings: FreshnessWarningDTO[] = [];
  for (const item of items) {
    const found = freshnessOf(
      { onHand: item.onHand, shelfLifeDays: item.shelfLifeDays, storage: item.storage, lotsNewestFirst: lotsByItem.get(itemKey(item.kind, item.itemId)) ?? [] },
      today
    );
    if (found) warnings.push({ kind: item.kind, itemId: item.itemId, itemName: item.name, baseUnit: item.baseUnit, onHand: item.onHand, storage: item.storage, ...found });
  }
  return warnings.sort((a, b) => a.daysLeft - b.daysLeft || a.itemName.localeCompare(b.itemName));
}
