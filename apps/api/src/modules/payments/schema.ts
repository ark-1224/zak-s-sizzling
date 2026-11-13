import { z } from "zod";

export const createPaymentIntentSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(["qrph"]),
});

// Staff take payment at the counter (the light POS on Orders awaiting payment): cash, with
// the amount the customer handed over for the change, or GCash / Maya paid to the shop's
// own account and recorded by hand with the reference number from the customer's phone
// (no PayMongo). An empty body is a cash payment, as before.
export const confirmCounterPaymentSchema = z
  .object({
    method: z.enum(["cash", "gcash", "maya"]).default("cash"),
    reference: z.string().trim().min(4, "Enter the reference number from the customer's app").max(100).optional(),
    amountTendered: z.number().nonnegative().max(1_000_000).optional(),
  })
  .refine((v) => v.method === "cash" || v.reference, { message: "Enter the reference number from the customer's app", path: ["reference"] })
  .refine((v) => v.method !== "cash" || v.reference === undefined, { message: "A cash payment has no reference number", path: ["reference"] })
  .refine((v) => v.method === "cash" || v.amountTendered === undefined, { message: "Cash received is for cash payments only", path: ["amountTendered"] });
