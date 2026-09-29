import { Prisma, type StockTracking } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getIO } from "../../websocket";
import { HttpError } from "../../middleware/errorHandler";

/**
 * Stock checks and deduction for orders, covering both tracking modes
 * (docs/design/raw-material-stock.md):
 * - `unit` products deduct their own count in `inventory`;
 * - `recipe` products deduct each raw material by its amount per serving.
 *
 * Deduction runs inside the payment-confirmation transaction, so an order either
 * takes everything it needs or nothing at all. Stock never goes below zero: every
 * decrement is conditional on enough stock remaining, and CHECK constraints in the
 * database back that up.
 */

type Decimal = Prisma.Decimal;
type Db = Prisma.TransactionClient;

/** Everything needed to work out an order line's stock needs. */
export const PRODUCT_STOCK_INCLUDE = {
  inventory: true,
  recipeItems: { include: { rawMaterial: true } },
} satisfies Prisma.ProductInclude;

export interface StockLine {
  qty: number;
  product: {
    id: string;
    name: string;
    tracking: StockTracking;
    recipeItems: { rawMaterialId: string; qtyPerServing: Decimal; rawMaterial: { name: string; unit: string } }[];
  };
}

export interface StockNeeds {
  /** Units needed per unit-tracked product, keyed by product id. */
  units: Map<string, { name: string; qty: number }>;
  /** Amount needed per raw material, keyed by raw material id, summed across the order. */
  materials: Map<string, { name: string; unit: string; qty: Decimal }>;
}

export interface Shortage {
  kind: "unit" | "material";
  id: string;
  name: string;
  unit: string | null;
  needed: string;
  available: string;
}

/** Totals what an order needs, adding up raw materials shared by several dishes. */
export function computeStockNeeds(lines: StockLine[]): StockNeeds {
  const units: StockNeeds["units"] = new Map();
  const materials: StockNeeds["materials"] = new Map();

  for (const { qty, product } of lines) {
    if (product.tracking === "unit") {
      units.set(product.id, { name: product.name, qty: (units.get(product.id)?.qty ?? 0) + qty });
      continue;
    }
    // A recipe product with no recipe lines would otherwise deduct nothing at all.
    if (product.recipeItems.length === 0) throw new HttpError(409, `${product.name} has no recipe set up yet`);
    for (const item of product.recipeItems) {
      const amount = item.qtyPerServing.mul(qty);
      const current = materials.get(item.rawMaterialId);
      materials.set(item.rawMaterialId, {
        name: item.rawMaterial.name,
        unit: item.rawMaterial.unit,
        qty: current ? current.qty.add(amount) : amount,
      });
    }
  }
  return { units, materials };
}

/** Lists everything the order needs more of than is in stock. */
export function findShortages(needs: StockNeeds, stock: { units: Map<string, number>; materials: Map<string, Decimal> }): Shortage[] {
  const shortages: Shortage[] = [];
  for (const [id, need] of needs.units) {
    const available = stock.units.get(id) ?? 0;
    if (available < need.qty) shortages.push({ kind: "unit", id, name: need.name, unit: null, needed: String(need.qty), available: String(available) });
  }
  for (const [id, need] of needs.materials) {
    const available = stock.materials.get(id) ?? new Prisma.Decimal(0);
    if (available.lessThan(need.qty)) {
      shortages.push({ kind: "material", id, name: need.name, unit: need.unit, needed: need.qty.toString(), available: available.toString() });
    }
  }
  return shortages;
}

/** Whole servings a recipe can still make: the smallest stock ÷ amount per serving. */
export function servingsAvailable(recipe: { qtyPerServing: Decimal; stockQty: Decimal }[]): number {
  if (recipe.length === 0) return 0;
  return Math.min(...recipe.map((r) => r.stockQty.div(r.qtyPerServing).floor().toNumber()));
}

export function describeShortage(s: Shortage): string {
  return s.kind === "unit"
    ? `${s.name}: needs ${s.needed}, only ${s.available} left`
    : `${s.name}: needs ${s.needed} ${s.unit}, only ${s.available} ${s.unit} left`;
}

export class StockShortageError extends HttpError {
  readonly shortages: Shortage[];
  constructor(shortages: Shortage[], message = `Not enough stock. ${shortages.map(describeShortage).join("; ")}`) {
    super(409, message);
    this.shortages = shortages;
  }
}

/**
 * Up-front check when a customer places an order: refuses it if current stock can't
 * cover it. Nothing is deducted here; the message names dishes, not raw materials.
 */
export interface NewOrderLine {
  qty: number;
  product: Omit<StockLine["product"], "recipeItems"> & {
    inventory: { stockQty: number } | null;
    recipeItems: { rawMaterialId: string; qtyPerServing: Decimal; rawMaterial: { name: string; unit: string; stockQty: Decimal } }[];
  };
}

export function assertStockForNewOrder(lines: NewOrderLine[]) {
  const needs = computeStockNeeds(lines);
  const stock = {
    units: new Map(lines.map((l) => [l.product.id, l.product.inventory?.stockQty ?? 0])),
    materials: new Map(lines.flatMap((l) => l.product.recipeItems.map((r) => [r.rawMaterialId, r.rawMaterial.stockQty] as const))),
  };
  const shortages = findShortages(needs, stock);
  if (shortages.length === 0) return;

  const shortIds = new Set(shortages.map((s) => s.id));
  const dishes = [
    ...new Set(
      lines
        .filter((l) => shortIds.has(l.product.id) || l.product.recipeItems.some((r) => shortIds.has(r.rawMaterialId)))
        .map((l) => l.product.name),
    ),
  ];
  throw new StockShortageError(shortages, `Sorry, there isn't enough stock for ${dishes.join(", ")} right now`);
}

export interface TouchedStock {
  productIds: string[];
  materialIds: string[];
}

/**
 * Deducts everything a paid order needs, inside the caller's transaction. Collects
 * every shortage and then throws StockShortageError, so the caller's transaction
 * rolls back and nothing is deducted. Rows are updated in a fixed (sorted) order so
 * two orders confirmed at the same moment can't deadlock each other.
 */
export async function deductStockForOrder(tx: Db, orderId: string): Promise<TouchedStock> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: { product: { include: { recipeItems: { include: { rawMaterial: true } } } } },
  });
  const needs = computeStockNeeds(items);
  const shortages: Shortage[] = [];

  for (const [productId, need] of [...needs.units].sort(([a], [b]) => a.localeCompare(b))) {
    const result = await tx.inventory.updateMany({
      where: { productId, stockQty: { gte: need.qty } },
      data: { stockQty: { decrement: need.qty } },
    });
    if (result.count === 0) {
      const current = await tx.inventory.findUnique({ where: { productId } });
      shortages.push({ kind: "unit", id: productId, name: need.name, unit: null, needed: String(need.qty), available: String(current?.stockQty ?? 0) });
    }
  }

  for (const [rawMaterialId, need] of [...needs.materials].sort(([a], [b]) => a.localeCompare(b))) {
    const result = await tx.rawMaterial.updateMany({
      where: { id: rawMaterialId, stockQty: { gte: need.qty } },
      data: { stockQty: { decrement: need.qty } },
    });
    const current = await tx.rawMaterial.findUniqueOrThrow({ where: { id: rawMaterialId } });
    if (result.count === 0) {
      shortages.push({ kind: "material", id: rawMaterialId, name: need.name, unit: need.unit, needed: need.qty.toString(), available: current.stockQty.toString() });
      continue;
    }
    await tx.rawMaterialMovement.create({
      data: {
        rawMaterialId,
        delta: need.qty.neg(),
        previousQty: current.stockQty.add(need.qty),
        newQty: current.stockQty,
        type: "sale",
        orderId,
      },
    });
  }

  if (shortages.length > 0) throw new StockShortageError(shortages);
  return { productIds: [...needs.units.keys()], materialIds: [...needs.materials.keys()] };
}

/**
 * After stock changes are committed: recomputes availability for the products
 * touched and every recipe product that uses a touched raw material, saves any
 * change, and broadcasts `inventory:updated` so the kiosk shows "Sold out" live.
 * For recipe products, `stockQty` in the event is the number of servings left.
 */
export async function refreshAvailability(touched: TouchedStock): Promise<void> {
  if (touched.productIds.length === 0 && touched.materialIds.length === 0) return;
  const products = await prisma.product.findMany({
    where: {
      OR: [{ id: { in: touched.productIds } }, { recipeItems: { some: { rawMaterialId: { in: touched.materialIds } } } }],
    },
    include: PRODUCT_STOCK_INCLUDE,
  });

  for (const product of products) {
    const stockQty =
      product.tracking === "recipe"
        ? servingsAvailable(product.recipeItems.map((r) => ({ qtyPerServing: r.qtyPerServing, stockQty: r.rawMaterial.stockQty })))
        : (product.inventory?.stockQty ?? 0);
    const isAvailable = stockQty > 0;
    if (isAvailable !== product.isAvailable) {
      await prisma.product.update({ where: { id: product.id }, data: { isAvailable } });
    }
    getIO()?.emit("inventory:updated", { productId: product.id, isAvailable, stockQty });
  }
}
