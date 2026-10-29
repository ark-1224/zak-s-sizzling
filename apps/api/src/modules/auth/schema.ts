import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const challengeSchema = z.object({
  challengeId: z.string().uuid(),
});

export const verifyCodeSchema = challengeSchema.extend({
  // Spaces or a dash pasted from the email are ignored.
  code: z
    .string()
    .transform((code) => code.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "The code is 6 digits")),
});
