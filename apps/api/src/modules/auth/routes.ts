import { Router, type Request, type Response } from "express";
import { HttpError } from "../../middleware/errorHandler";
import { loginSchema } from "./schema";
import { createKioskSession, loginWithPassword, refreshAccessToken } from "./service";

export const authRouter = Router();

const REFRESH_COOKIE = "zaks_refresh";
const isProd = process.env.NODE_ENV === "production";

// Scoped to /api/auth so the browser only ever sends this cookie to the three routes
// below, not to every API request — it never needs to leave this router.
function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// Staff/Admin login — Sprint 1
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const { accessToken, refreshToken, user } = await loginWithPassword(email, password);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
});

// Silently renews the 15-minute access token using the httpOnly refresh cookie — the
// frontend calls this in the background (apps/web/src/lib/auth.ts) so a staff/admin
// session survives longer than 15 minutes without another password prompt.
authRouter.post("/refresh", async (req: Request, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new HttpError(401, "No refresh token");
    const { accessToken, refreshToken, user } = await refreshAccessToken(token);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.status(204).end();
});

// Anonymous kiosk session — used for cart/idle-timeout/offline-queue correlation
authRouter.post("/kiosk-session", (req, res) => {
  const result = createKioskSession();
  res.json(result);
});
