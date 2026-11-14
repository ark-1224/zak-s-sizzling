import type { AdjustmentReason } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { itemKey } from "../purchasing/stockItems";
import { WASTE_REASONS } from "./schema";

// What moved in and out of each stock item between two moments, in base units, from the
// logs the system already keeps:
// - raw materials: their movement log (sales deducted from recipes, restocks and market
//   purchases, waste, returns, corrections);
// - ready-made items: their adjustment log, plus the pieces of paid orders (a sale has no
//   log row of its own; it counts when the order was paid, qty + cancelledQty).
// Corrections made by a stock count are left out: they are the count's variance, not usage.

export interface Flow {
  /** Stock added: market purchases and other restocks. */
  purchased: number;
  /** Used by sales, less sales put back (cancelled orders, returns). */
  sold: number;
  /** Damaged, spoiled, dropped, over-prepped. */
  wasted: number;
  wastedByReason: Partial<Record<AdjustmentReason, number>>;
  /** Other manual changes (corrections, "other"), signed. */
  other: number;
}

const emptyFlow = (): Flow => ({ purchased: 0, sold: 0, wasted: 0, wastedByReason: {}, other: 0 });
const isWaste = (reason: AdjustmentReason | null): reason is (typeof WASTE_REASONS)[number] =>
  reason !== null && (WASTE_REASONS as readonly string[]).includes(reason);

function apply(flow: Flow, reason: AdjustmentReason | null, type: "sale" | "restock" | "adjustment", delta: number) {
  if (type === "sale") flow.sold += -delta;
  else if (reason === "restock" || type === "restock") flow.purchased += delta;
  else if (reason === "return") flow.sold -= delta;
  else if (isWaste(reason)) {
    flow.wasted += -delta;
    flow.wastedByReason[reason] = (flow.wastedByReason[reason] ?? 0) + -delta;
  } else flow.other += delta;
}

/** Flows per item key (purchasing/stockItems.ts itemKey) in [from, to). */
export async function stockFlows(from: Date, to: Date): Promise<Map<string, Flow>> {
  const when = { gte: from, lt: to };
  const [movements, adjustments, sales] = await Promise.all([
    prisma.rawMaterialMovement.findMany({
      where: { createdAt: when, stockCountId: null },
      select: { rawMaterialId: true, delta: true, type: true, reason: true },
    }),
    prisma.stockAdjustment.findMany({
      where: { createdAt: when, stockCountId: null, product: { tracking: "unit" } },
      select: { productId: true, delta: true, reason: true },
    }),
    prisma.orderItem.findMany({
      where: { product: { tracking: "unit" }, order: { payment: { paidAt: when } } },
      select: { productId: true, qty: true, cancelledQty: true },
    }),
  ]);

  const flows = new Map<string, Flow>();
  const flowOf = (key: string) => flows.get(key) ?? flows.set(key, emptyFlow()).get(key)!;
  for (const m of movements) apply(flowOf(itemKey("raw_material", m.rawMaterialId)), m.reason, m.type, Number(m.delta));
  for (const a of adjustments) apply(flowOf(itemKey("ready_made", a.productId)), a.reason, "adjustment", a.delta);
  for (const s of sales) flowOf(itemKey("ready_made", s.productId)).sold += s.qty + s.cancelledQty;
  return flows;
}

export function flowFor(flows: Map<string, Flow>, key: string): Flow {
  return flows.get(key) ?? emptyFlow();
}
