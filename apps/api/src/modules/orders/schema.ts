import { z } from "zod";

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        // Upper bound matters, not just lower — Order.totalAmount/OrderItem.subtotal
        // are Decimal(10,2) (max ~99,999,999.99); an unbounded qty on a cheap item
        // can overflow that column, surfacing as a raw DB error instead of a clean
        // validation message. 999 is far beyond any real kiosk order.
        qty: z.number().int().positive().max(999, "Quantity must be 999 or fewer"),
        specialInstructions: z.string().max(140).optional(),
      })
    )
    .min(1, "Order must contain at least one item"),
  customerName: z.string().max(120).optional(),
  paymentMethod: z.enum(["counter", "qrph"]).optional(),
  // Dine in or take out, chosen on the kiosk; orders that don't say are dine in.
  orderType: z.enum(["dine_in", "take_out"]).optional(),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-28");

// Filters for the transaction history (GET /api/orders/history). Dates are Manila days,
// both included; without them it shows today.
export const transactionQuerySchema = z
  .object({
    from: day.optional(),
    to: day.optional(),
    status: z.enum(["pending", "confirmed", "preparing", "ready", "completed", "cancelled"]).optional(),
    method: z.enum(["counter", "qrph", "gcash", "maya"]).optional(),
    paid: z.enum(["paid", "unpaid"]).optional(),
    q: z.string().max(40).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must be on or before the end date", path: ["from"] });

// The cart shown at checkout, for its estimated preparation time (prepTime.ts).
export const estimateOrderSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().int().positive().max(999) }))
    .min(1, "Order must contain at least one item")
    .max(100),
});
