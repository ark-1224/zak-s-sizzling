import { z } from "zod";

// Exactly one of setQty/delta — setQty for "count it and set the number", delta for
// "add/remove N units" (returns, damage, spoilage, manual corrections per the
// manuscript's Stock Adjustments feature).
export const adjustStockSchema = z
  .object({
    setQty: z.number().int().nonnegative().optional(),
    delta: z.number().int().optional(),
    minStockThreshold: z.number().int().nonnegative().optional(),
  })
  .refine((v) => v.setQty === undefined || v.delta === undefined, {
    message: "Provide either setQty or delta, not both",
  });
