import { z } from "zod";
import { adjustmentReasonSchema } from "../inventory/schema";

// Amounts are in the raw material's base unit (g, ml or pc), up to 3 decimal places,
// matching the Decimal(12, 3) columns. See docs/design/raw-material-stock.md.
const amount = z.number().nonnegative().max(100_000_000);

export const createRawMaterialSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.enum(["g", "ml", "pc"]),
  stockQty: amount.default(0),
  minStockThreshold: amount.default(0),
  costPerUnit: z.number().nonnegative().max(1_000_000).optional(),
});

// The unit can't change after creation: recipes and the movement log are written in it.
export const updateRawMaterialSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  minStockThreshold: amount.optional(),
  costPerUnit: z.number().nonnegative().max(1_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
});

// Exactly one of setQty ("counted it, set the number") or delta ("add or remove this
// much"), always with a reason, so every movement in the log is explainable.
export const adjustRawMaterialSchema = z
  .object({
    setQty: amount.optional(),
    delta: z.number().min(-100_000_000).max(100_000_000).optional(),
    reason: adjustmentReasonSchema,
    note: z.string().max(200).optional(),
  })
  .refine((v) => (v.setQty === undefined) !== (v.delta === undefined), {
    message: "Provide either setQty or delta",
  })
  .refine((v) => v.delta !== 0, { message: "The change can't be zero" });

export const rawMaterialIdSchema = z.string().uuid();
