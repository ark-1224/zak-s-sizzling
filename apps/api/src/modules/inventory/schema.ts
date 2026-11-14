import { z } from "zod";

// Exactly one of setQty/delta — setQty for "count it and set the number", delta for
// "add/remove N units" (returns, damage, spoilage, manual corrections per the
// manuscript's Stock Adjustments feature). A reason is required whenever the quantity
// actually changes, so every entry in the stock_adjustments log is explainable.
export const adjustmentReasonSchema = z.enum(["restock", "return", "damaged", "spoilage", "correction", "other", "dropped", "over_prepped"]);

// Waste: damaged goods, spoilage, dropped and over-prepped food only ever take stock away,
// so these reasons must lower the count (UI review #5). The web forms apply the same rule;
// this keeps the log honest. The waste report (reports/usage.ts) adds them up.
export const WASTE_REASONS = ["damaged", "spoilage", "dropped", "over_prepped"] as const;
export const DECREASE_ONLY_REASONS: readonly z.infer<typeof adjustmentReasonSchema>[] = WASTE_REASONS;
export const DECREASE_ONLY_MESSAGE = "Waste (damaged, spoiled, dropped or over-prepped) can only lower the stock";

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

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-13");

// Filters for the Stock movements tab (GET /api/inventory/movements): raw materials,
// ready-made items or both; one item; sales, restocks or other adjustments; Manila dates,
// both included. Newest first, up to `limit`.
export const stockMovementQuerySchema = z
  .object({
    kind: z.enum(["raw_material", "ready_made"]).optional(),
    itemId: z.string().uuid().optional(),
    type: z.enum(["sale", "restock", "adjustment"]).optional(),
    from: day.optional(),
    to: day.optional(),
    limit: z.coerce.number().int().min(1).max(300).default(150),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must be on or before the end date", path: ["from"] });

// The count sheet: what was counted for each item (base units; whole pieces for
// ready-made items, checked in counts.ts). Only the items sent are counted.
export const createStockCountSchema = z.object({
  note: z.string().trim().max(200).optional(),
  lines: z
    .array(z.object({ kind: z.enum(["raw_material", "ready_made"]), itemId: z.string().uuid(), countedQty: z.number().min(0).max(100_000_000) }))
    .min(1, "Count at least one item")
    .max(500),
});

// A report period in Manila days, both included (usage, waste, food cost).
export const reportPeriodSchema = z
  .object({ from: day.optional(), to: day.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must be on or before the end date", path: ["from"] });
