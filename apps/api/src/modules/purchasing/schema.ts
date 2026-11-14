import { z } from "zod";

// A market receipt as the owner enters it after the trip: the date, a regular trip or a
// top-up, optionally the store or stall, and one line per item bought (in a market unit
// or the base unit, with what was paid for the line). A line can record 0 bought: planned
// on the shopping list but not found.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-15");
const kind = z.enum(["raw_material", "ready_made"]);

export const purchaseLineSchema = z.object({
  kind,
  itemId: z.string().uuid(),
  unitName: z.string().trim().min(1).max(40),
  qtyUnits: z.number().min(0).max(100_000),
  lineTotal: z.number().min(0).max(10_000_000),
  plannedUnits: z.number().min(0).max(100_000).optional(),
  expiresOn: day.optional(),
});

export const createPurchaseSchema = z.object({
  purchasedOn: day,
  kind: z.enum(["market_trip", "top_up"]).default("market_trip"),
  store: z.string().trim().max(120).optional(),
  note: z.string().trim().max(200).optional(),
  lines: z.array(purchaseLineSchema).min(1, "Add at least one item from the receipt").max(150),
});

export const purchaseListQuerySchema = z.object({
  from: day.optional(),
  to: day.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const priceHistoryQuerySchema = z.object({
  kind,
  itemId: z.string().uuid(),
});

export const shoppingListQuerySchema = z.object({
  // Days until the next market trip (the owner goes about every two weeks).
  days: z.coerce.number().int().min(1).max(60).default(14),
});
