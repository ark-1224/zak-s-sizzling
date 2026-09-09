import { z } from "zod";

// Only admin/staff accounts are managed here — "customer" has no login, it's the
// anonymous kiosk-session role (see auth/service.ts createKioskSession).
export const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(160),
  password: z.string().min(8).max(72),
  role: z.enum(["admin", "staff"]),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(["admin", "staff"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(72).optional(),
});
