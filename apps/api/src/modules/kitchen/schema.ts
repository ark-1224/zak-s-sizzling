import { z } from "zod";

export const updateTaskStatusSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed"]),
});
