import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { costWhenPaid, servingCost } from "../../src/modules/inventory/costing";
import { freshnessOf, lotsOnHand } from "../../src/modules/inventory/freshness";
import { planPurchase, type PlanInput } from "../../src/modules/purchasing/shoppingList";

// The rules behind the palengke cycle: what to buy before a market trip, how old the stock
// on hand is, and what a dish costs from its recipe.

const D = (v: number) => new Prisma.Decimal(v);

const plan = (over: Partial<PlanInput>) =>
  planPurchase({
    onHand: 0,
    avgDailyUsage: 0,
    days: 14,
    safetyStock: null,
    parLevel: null,
    shelfLifeDays: null,
    storage: null,
    wholePieces: false,
    unit: { name: "kg", qtyInBase: 1000 },
    ...over,
  });

describe("the shopping list's rule (planPurchase)", () => {
  it("buys enough for the days until the next trip plus the safety stock, less what's on hand", () => {
    // 250 g a day × 14 days + 500 g buffer = 4000 g; 1500 g on hand → 2500 g → 3 kg.
    const p = plan({ onHand: 1500, avgDailyUsage: 250, safetyStock: 500 });
    expect(p).toMatchObject({ coverDays: 14, targetQty: 4000, buyBase: 2500, buyUnits: 3, shortShelfLife: false });
  });

  it("never plans above the par level", () => {
    const p = plan({ onHand: 1000, avgDailyUsage: 500, parLevel: 3000 });
    expect(p.targetQty).toBe(3000);
    expect(p.buyBase).toBe(2000);
  });

  it("buys nothing when the stock already covers the trip", () => {
    expect(plan({ onHand: 5000, avgDailyUsage: 100 })).toMatchObject({ buyBase: 0, buyUnits: 0 });
  });

  it("covers only the days an item stays fresh, unless it's frozen", () => {
    const fresh = plan({ avgDailyUsage: 100, shelfLifeDays: 3, storage: "chilled" });
    expect(fresh).toMatchObject({ coverDays: 3, shortShelfLife: true, buyBase: 300 });
    const frozen = plan({ avgDailyUsage: 100, shelfLifeDays: 3, storage: "frozen" });
    expect(frozen).toMatchObject({ coverDays: 14, shortShelfLife: false });
  });

  it("rounds up to whole pieces and whole market units", () => {
    const p = plan({ avgDailyUsage: 2.3, days: 7, wholePieces: true, unit: { name: "case", qtyInBase: 12 } });
    // 16.1 pieces → 17 pieces → 2 cases of 12.
    expect(p).toMatchObject({ buyBase: 17, buyUnits: 2 });
  });
});

describe("how old the stock on hand is (oldest used first)", () => {
  const lots = [
    { purchasedOn: "2026-11-14", qtyBase: 1000, expiresOn: null },
    { purchasedOn: "2026-11-10", qtyBase: 1000, expiresOn: null },
    { purchasedOn: "2026-11-01", qtyBase: 1000, expiresOn: null },
  ];

  it("takes the newest purchases that add up to what's on hand", () => {
    expect(lotsOnHand(1500, lots).map((l) => l.purchasedOn)).toEqual(["2026-11-14", "2026-11-10"]);
  });

  it("warns to use soon when the oldest stock is near its days fresh", () => {
    const w = freshnessOf({ onHand: 1500, shelfLifeDays: 6, storage: "chilled", lotsNewestFirst: lots }, "2026-11-15");
    expect(w).toMatchObject({ status: "use_soon", basis: "shelf_life", boughtOn: "2026-11-10", goesOffOn: "2026-11-16", daysLeft: 1 });
  });

  it("says it's past its days fresh once they have gone by", () => {
    const w = freshnessOf({ onHand: 2500, shelfLifeDays: 3, storage: "room", lotsNewestFirst: lots }, "2026-11-15");
    expect(w).toMatchObject({ status: "expired", boughtOn: "2026-11-01", daysLeft: -11 });
  });

  it("uses a printed expiry date within a week", () => {
    const printed = [{ purchasedOn: "2026-11-10", qtyBase: 12, expiresOn: "2026-11-20" }];
    expect(freshnessOf({ onHand: 6, shelfLifeDays: null, storage: null, lotsNewestFirst: printed }, "2026-11-15")).toMatchObject({
      status: "use_soon",
      basis: "printed_date",
      daysLeft: 5,
    });
  });

  it("says nothing when the stock is fresh, or when there is none", () => {
    expect(freshnessOf({ onHand: 500, shelfLifeDays: 30, storage: "frozen", lotsNewestFirst: lots }, "2026-11-15")).toBeNull();
    expect(freshnessOf({ onHand: 0, shelfLifeDays: 1, storage: "room", lotsNewestFirst: lots }, "2026-11-15")).toBeNull();
  });
});

describe("what a dish costs (servingCost)", () => {
  const dish = (costs: (number | null)[]) => ({
    tracking: "recipe" as const,
    cost: null,
    recipeItems: costs.map((c, i) => ({ qtyPerServing: D([150, 200][i]), rawMaterial: { costPerUnit: c === null ? null : D(c) } })),
  });

  it("adds each raw material's amount × cost per unit", () => {
    // 150 g × ₱0.32 + 200 g × ₱0.05 = ₱48 + ₱10.
    const cost = servingCost(dish([0.32, 0.05]));
    expect(cost.complete).toBe(true);
    expect(cost.cost?.toNumber()).toBe(58);
    expect(costWhenPaid(dish([0.32, 0.05]))?.toNumber()).toBe(58);
  });

  it("marks a cost incomplete when a raw material has no price, and saves none on a sale", () => {
    const cost = servingCost(dish([0.32, null]));
    expect(cost).toMatchObject({ complete: false });
    expect(cost.cost?.toNumber()).toBe(48);
    expect(costWhenPaid(dish([0.32, null]))).toBeNull();
  });

  it("uses a ready-made item's own cost per piece", () => {
    expect(servingCost({ tracking: "unit", cost: D(18), recipeItems: [] })).toMatchObject({ complete: true });
  });
});
