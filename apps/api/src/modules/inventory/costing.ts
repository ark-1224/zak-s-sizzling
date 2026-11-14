import { Prisma } from "@prisma/client";

// What a dish or ready-made item costs to make, from the latest market prices: a recipe
// dish is the sum of its raw materials' amount per serving × cost per unit (cost per unit
// is updated by every market purchase, purchasing/service.ts); a ready-made item has its
// own cost per piece. Food cost, margins and inventory value all start here.

type Decimal = Prisma.Decimal;

export interface CostedProduct {
  tracking: "unit" | "recipe";
  cost: Decimal | null;
  recipeItems: { qtyPerServing: Decimal; rawMaterial: { costPerUnit: Decimal | null } }[];
}

export interface ServingCost {
  /** The cost, or null when nothing in it has a price. */
  cost: Decimal | null;
  /** False when some raw material has no cost per unit yet (cost is then too low). */
  complete: boolean;
}

/** One serving's cost at today's prices. */
export function servingCost(product: CostedProduct): ServingCost {
  if (product.tracking === "unit") return { cost: product.cost, complete: product.cost !== null };
  if (product.recipeItems.length === 0) return { cost: null, complete: false };
  let total = new Prisma.Decimal(0);
  let priced = 0;
  for (const item of product.recipeItems) {
    if (item.rawMaterial.costPerUnit === null) continue;
    total = total.add(item.qtyPerServing.mul(item.rawMaterial.costPerUnit));
    priced += 1;
  }
  return { cost: priced === 0 ? null : total.toDecimalPlaces(4), complete: priced === product.recipeItems.length };
}

/** The cost saved on an order line when it is paid: only a complete cost, so food cost
 *  is never understated by a missing price. */
export function costWhenPaid(product: CostedProduct): Decimal | null {
  const { cost, complete } = servingCost(product);
  return complete ? cost : null;
}
