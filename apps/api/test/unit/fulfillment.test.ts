import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertStockForNewOrder,
  computeStockNeeds,
  describeShortage,
  findShortages,
  servingsAvailable,
  StockShortageError,
  type NewOrderLine,
} from "../../src/modules/inventory/fulfillment";

const D = (v: number) => new Prisma.Decimal(v);
const pork = { name: "Pork", unit: "g" };
const rice = { name: "Rice", unit: "g" };

const sisigBowl = {
  id: "bowl",
  name: "Sisig Rice Bowl",
  tracking: "recipe" as const,
  recipeItems: [
    { rawMaterialId: "pork", qtyPerServing: D(150), rawMaterial: pork },
    { rawMaterialId: "rice", qtyPerServing: D(200), rawMaterial: rice },
  ],
};
const garlicRice = {
  id: "garlic-rice",
  name: "Garlic Rice",
  tracking: "recipe" as const,
  recipeItems: [{ rawMaterialId: "rice", qtyPerServing: D(100), rawMaterial: rice }],
};
const icedTea = { id: "tea", name: "Iced Tea", tracking: "unit" as const, recipeItems: [] };

describe("computeStockNeeds", () => {
  it("multiplies each recipe amount by the quantity ordered", () => {
    const needs = computeStockNeeds([{ qty: 2, product: sisigBowl }]);

    expect(needs.materials.get("pork")?.qty.toNumber()).toBe(300);
    expect(needs.materials.get("rice")?.qty.toNumber()).toBe(400);
    expect(needs.units.size).toBe(0);
  });

  it("adds up a raw material shared by different dishes", () => {
    const needs = computeStockNeeds([
      { qty: 1, product: sisigBowl },
      { qty: 3, product: garlicRice },
    ]);

    expect(needs.materials.get("rice")?.qty.toNumber()).toBe(200 + 300);
  });

  it("counts unit products by quantity and merges repeated lines", () => {
    const needs = computeStockNeeds([
      { qty: 2, product: icedTea },
      { qty: 1, product: icedTea },
    ]);

    expect(needs.units.get("tea")).toEqual({ name: "Iced Tea", qty: 3 });
    expect(needs.materials.size).toBe(0);
  });

  it("refuses a recipe product that has no recipe set up", () => {
    const empty = { ...sisigBowl, recipeItems: [] };

    expect(() => computeStockNeeds([{ qty: 1, product: empty }])).toThrow("Sisig Rice Bowl has no recipe set up yet");
  });
});

describe("servingsAvailable", () => {
  it("is limited by the ingredient that runs out first", () => {
    const servings = servingsAvailable([
      { qtyPerServing: D(150), stockQty: D(1000) }, // 6 servings of pork
      { qtyPerServing: D(200), stockQty: D(500) }, // 2 servings of rice
    ]);

    expect(servings).toBe(2);
  });

  it("rounds down to whole servings", () => {
    expect(servingsAvailable([{ qtyPerServing: D(85.5), stockQty: D(170) }])).toBe(1);
  });

  it("is zero when an ingredient is empty or no recipe exists", () => {
    expect(servingsAvailable([{ qtyPerServing: D(100), stockQty: D(0) }])).toBe(0);
    expect(servingsAvailable([])).toBe(0);
  });
});

describe("findShortages", () => {
  const needs = computeStockNeeds([
    { qty: 2, product: sisigBowl },
    { qty: 4, product: icedTea },
  ]);

  it("reports nothing when stock covers the order exactly", () => {
    const shortages = findShortages(needs, { units: new Map([["tea", 4]]), materials: new Map([["pork", D(300)], ["rice", D(400)]]) });

    expect(shortages).toEqual([]);
  });

  it("reports each unit product and raw material that is short", () => {
    const shortages = findShortages(needs, { units: new Map([["tea", 3]]), materials: new Map([["pork", D(300)], ["rice", D(399.5)]]) });

    expect(shortages.map(describeShortage)).toEqual(["Iced Tea: needs 4, only 3 left", "Rice: needs 400 g, only 399.5 g left"]);
  });
});

describe("assertStockForNewOrder", () => {
  const line = (qty: number, porkLeft: number, riceLeft: number): NewOrderLine => ({
    qty,
    product: {
      ...sisigBowl,
      inventory: null,
      recipeItems: [
        { rawMaterialId: "pork", qtyPerServing: D(150), rawMaterial: { ...pork, stockQty: D(porkLeft) } },
        { rawMaterialId: "rice", qtyPerServing: D(200), rawMaterial: { ...rice, stockQty: D(riceLeft) } },
      ],
    },
  });

  it("accepts an order the current stock can make", () => {
    expect(() => assertStockForNewOrder([line(2, 1000, 500)])).not.toThrow();
  });

  it("refuses an order it cannot make, naming the dish rather than the raw material", () => {
    try {
      assertStockForNewOrder([line(3, 1000, 500)]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(StockShortageError);
      expect((err as StockShortageError).status).toBe(409);
      expect((err as Error).message).toBe("Sorry, there isn't enough stock for Sisig Rice Bowl right now");
    }
  });
});
