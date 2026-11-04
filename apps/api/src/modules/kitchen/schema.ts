import { z } from "zod";

export const updateTaskStatusSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed"]),
});

export const cancelKitchenOrderSchema = z.object({
  reason: z.string().trim().min(1, "Say why the order is being cancelled").max(200),
});
