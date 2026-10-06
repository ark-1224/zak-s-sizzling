import { z } from "zod";

// Exactly one of setQty/delta — setQty for "count it and set the number", delta for
// "add/remove N units" (returns, damage, spoilage, manual corrections per the
// manuscript's Stock Adjustments feature). A reason is required whenever the quantity
// actually changes, so every entry in the stock_adjustments log is explainable.
export const adjustmentReasonSchema = z.enum(["restock", "return", "damaged", "spoilage", "correction", "other"]);

// Damaged goods and spoilage only ever take stock away, so these reasons must lower the
// count (UI review #5). The web forms apply the same rule; this keeps the log honest.
export const DECREASE_ONLY_REASONS: readonly z.infer<typeof adjustmentReasonSchema>[] = ["damaged", "spoilage"];
export const DECREASE_ONLY_MESSAGE = "Damaged goods and spoilage can only lower the stock";

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
