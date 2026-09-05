import { z } from "zod";

export const createPaymentIntentSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(["gcash", "maya"]),
});
