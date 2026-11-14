import { Prisma } from "@prisma/client";
import type { MaterialUnit, StockItemKind, StorageType } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";

// One view of everything the shop keeps in stock: raw materials (g, ml or pieces) and
// ready-made items (products counted in pieces, the Ready-made category). Purchases,
// counts, the shopping list, usage and freshness all work on these.

type Db = Prisma.TransactionClient | typeof prisma;

export interface StockItem {
  kind: StockItemKind;
  itemId: string;
  name: string;
  baseUnit: MaterialUnit;
  onHand: number;
  /** Cost of one base unit; null when not known. */
  costPerBase: number | null;
  minStock: number;
  parLevel: number | null;
  safetyStock: number | null;
  storage: StorageType | null;
  shelfLifeDays: number | null;
  /** Market units, smallest first. */
  units: { name: string; qtyInBase: number }[];
}

export const itemKey = (kind: StockItemKind, itemId: string) => `${kind}:${itemId}`;

const MATERIAL_INCLUDE = { purchaseUnits: true } satisfies Prisma.RawMaterialInclude;
const PRODUCT_INCLUDE = { inventory: true, purchaseUnits: true } satisfies Prisma.ProductInclude;
type MaterialRow = Prisma.RawMaterialGetPayload<{ include: typeof MATERIAL_INCLUDE }>;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

const toUnits = (rows: { name: string; qtyInBase: Prisma.Decimal }[]) =>
  rows.map((u) => ({ name: u.name, qtyInBase: Number(u.qtyInBase) })).sort((a, b) => a.qtyInBase - b.qtyInBase);
const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

function fromMaterial(m: MaterialRow): StockItem {
  return {
    kind: "raw_material",
    itemId: m.id,
    name: m.name,
    baseUnit: m.unit,
    onHand: Number(m.stockQty),
    costPerBase: num(m.costPerUnit),
    minStock: Number(m.minStockThreshold),
    parLevel: num(m.parLevel),
    safetyStock: num(m.safetyStock),
    storage: m.storage,
    shelfLifeDays: m.shelfLifeDays,
    units: toUnits(m.purchaseUnits),
  };
}

function fromProduct(p: ProductRow): StockItem {
  return {
    kind: "ready_made",
    itemId: p.id,
    name: p.name,
    baseUnit: "pc",
    onHand: p.inventory?.stockQty ?? 0,
    costPerBase: num(p.cost),
    minStock: p.inventory?.minStockThreshold ?? 0,
    parLevel: p.inventory?.parLevel ?? null,
    safetyStock: p.inventory?.safetyStock ?? null,
    storage: p.inventory?.storage ?? null,
    shelfLifeDays: p.inventory?.shelfLifeDays ?? null,
    units: toUnits(p.purchaseUnits),
  };
}

/** Every raw material in use and every ready-made item, by name. */
export async function listStockItems(db: Db = prisma): Promise<StockItem[]> {
  const [materials, products] = await Promise.all([
    db.rawMaterial.findMany({ where: { isActive: true }, include: MATERIAL_INCLUDE, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tracking: "unit" }, include: PRODUCT_INCLUDE, orderBy: { name: "asc" } }),
  ]);
  return [...materials.map(fromMaterial), ...products.map(fromProduct)];
}

/** One stock item (a raw material in use or not, or a ready-made item). A recipe dish isn't
 *  one: its stock is its raw materials. */
export async function getStockItem(kind: StockItemKind, itemId: string, db: Db = prisma): Promise<StockItem> {
  if (kind === "raw_material") {
    const m = await db.rawMaterial.findUnique({ where: { id: itemId }, include: MATERIAL_INCLUDE });
    if (!m) throw new HttpError(404, "Raw material not found");
    return fromMaterial(m);
  }
  const p = await db.product.findUnique({ where: { id: itemId }, include: PRODUCT_INCLUDE });
  if (!p) throw new HttpError(404, "Item not found");
  if (p.tracking !== "unit") throw new HttpError(400, `${p.name} is a dish: its stock is its raw materials, so choose those instead`);
  return fromProduct(p);
}

/** The Manila calendar day (YYYY-MM-DD) of a moment. */
export function manilaDay(at: Date): string {
  return new Date(at.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The start of a Manila day (UTC+8, no daylight saving). */
export function startOfManilaDay(day: string): Date {
  return new Date(`${day}T00:00:00+08:00`);
}

/** A date column (no time) as YYYY-MM-DD. */
export const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Whole days from one day to another (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
