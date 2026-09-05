import { Router } from "express";
import { loginSchema } from "./schema";
import { createKioskSession, loginWithPassword } from "./service";

export const authRouter = Router();

// Staff/Admin login — Sprint 1
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await loginWithPassword(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Anonymous kiosk session — used for cart/idle-timeout/offline-queue correlation
authRouter.post("/kiosk-session", (req, res) => {
  const result = createKioskSession();
  res.json(result);
});

// TODO(Sprint 2+): POST /refresh once httpOnly refresh-cookie flow is wired up.
