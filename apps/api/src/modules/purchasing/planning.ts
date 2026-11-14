import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { PurchaseUnitDTO, StockPlanning, StockPlanningInput } from "@zaks/shared-types";
import { HttpError } from "../../middleware/errorHandler";

// Planning fields every stock item has (raw materials and ready-made items): the market
// units it's bought in (unit conversion: "1 tray = 30 pc"), the most to keep on hand (par
// level), a buffer (safety stock), and how it's stored and for how many days a purchase
// stays fresh (shelf life). All amounts are in the item's base unit (g, ml or pieces).

const BASE_UNIT_NAMES = new Set(["g", "ml", "pc"]);
const amount = z.number().nonnegative().max(100_000_000);

export const purchaseUnitSchema = z.object({
  name: z.string().trim().min(1, "Name the unit, like kg or tray").max(40),
  qtyInBase: z.number().positive("A unit must hold more than 0").max(100_000_000),
});

export const stockPlanningSchema = z.object({
  parLevel: amount.nullable().optional(),
  safetyStock: amount.nullable().optional(),
  storage: z.enum(["frozen", "chilled", "room"]).nullable().optional(),
  shelfLifeDays: z.number().int().min(1).max(3650).nullable().optional(),
  purchaseUnits: z
    .array(purchaseUnitSchema)
    .max(10)
    .refine((units) => new Set(units.map((u) => u.name.toLowerCase())).size === units.length, { message: "Each market unit can appear once" })
    .refine((units) => units.every((u) => !BASE_UNIT_NAMES.has(u.name.toLowerCase())), {
      message: "g, ml and pc are the base units already; name the market unit differently (kg, tray, bottle…)",
    })
    .optional(),
});

type Db = Prisma.TransactionClient;
type Target = { rawMaterialId: string } | { productId: string };

/** Checks what Zod can't: pieces are whole, and the buffer fits under the par level. */
export function assertPlanning(input: StockPlanningInput, wholePieces: boolean) {
  if (wholePieces) {
    for (const [label, value] of [["Par level", input.parLevel], ["Safety stock", input.safetyStock]] as const) {
      if (value != null && !Number.isInteger(value)) throw new HttpError(400, `${label} is in whole pieces`);
    }
  }
  if (input.parLevel != null && input.safetyStock != null && input.safetyStock > input.parLevel) {
    throw new HttpError(400, "The safety stock can't be more than the par level");
  }
}

/** The planning columns to save on raw_materials or inventory, for the fields sent. */
export function planningColumns(input: StockPlanningInput) {
  return {
    parLevel: input.parLevel,
    safetyStock: input.safetyStock,
    storage: input.storage,
    shelfLifeDays: input.shelfLifeDays,
  };
}

/** Replaces an item's market units, when the form sends them. */
export async function savePurchaseUnits(db: Db, target: Target, units: StockPlanningInput["purchaseUnits"]) {
  if (units === undefined) return;
  await db.purchaseUnit.deleteMany({ where: target });
  if (units.length > 0) {
    await db.purchaseUnit.createMany({ data: units.map((u) => ({ ...target, name: u.name.trim(), qtyInBase: new Prisma.Decimal(u.qtyInBase).toDecimalPlaces(3) })) });
  }
}

type PlanningRow = {
  parLevel: Prisma.Decimal | number | null;
  safetyStock: Prisma.Decimal | number | null;
  storage: "frozen" | "chilled" | "room" | null;
  shelfLifeDays: number | null;
};

const num = (v: Prisma.Decimal | number | null) => (v === null ? null : Number(v));

export function toPurchaseUnitDTO(u: { id: string; name: string; qtyInBase: Prisma.Decimal }): PurchaseUnitDTO {
  return { id: u.id, name: u.name, qtyInBase: Number(u.qtyInBase) };
}

export function toPlanningDTO(row: PlanningRow | null, units: { id: string; name: string; qtyInBase: Prisma.Decimal }[]): StockPlanning {
  return {
    parLevel: row ? num(row.parLevel) : null,
    safetyStock: row ? num(row.safetyStock) : null,
    storage: row?.storage ?? null,
    shelfLifeDays: row?.shelfLifeDays ?? null,
    purchaseUnits: [...units].sort((a, b) => Number(a.qtyInBase) - Number(b.qtyInBase)).map(toPurchaseUnitDTO),
  };
}
