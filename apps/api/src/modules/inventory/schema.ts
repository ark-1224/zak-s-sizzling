import { z } from "zod";

// Exactly one of setQty/delta — setQty for "count it and set the number", delta for
// "add/remove N units" (returns, damage, spoilage, manual corrections per the
// manuscript's Stock Adjustments feature). A reason is required whenever the quantity
// actually changes, so every entry in the stock_adjustments log is explainable.
export const adjustmentReasonSchema = z.enum(["restock", "return", "damaged", "spoilage", "correction", "other"]);

export const adjustStockSchema = z
  .object({
    setQty: z.number().int().nonnegative().optional(),
    delta: z.number().int().optional(),
    minStockThreshold: z.number().int().nonnegative().optional(),
    reason: adjustmentReasonSchema.optional(),
    note: z.string().max(200).optional(),
  })
  .refine((v) => v.setQty === undefined || v.delta === undefined, {
    message: "Provide either setQty or delta, not both",
  })
  .refine((v) => (v.setQty === undefined && v.delta === undefined) || v.reason !== undefined, {
    message: "A reason is required when adjusting stock quantity",
  });
