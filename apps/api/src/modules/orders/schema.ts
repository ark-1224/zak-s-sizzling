import { z } from "zod";

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().int().positive(),
        specialInstructions: z.string().max(140).optional(),
      })
    )
    .min(1, "Order must contain at least one item"),
  customerName: z.string().max(120).optional(),
  paymentMethod: z.enum(["gcash", "maya", "counter"]).optional(),
});
