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
  paymentMethod: z.enum(["gcash", "maya", "counter"]).optional(),
});
