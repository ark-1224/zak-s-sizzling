import { Router, type Request, type Response } from "express";
import { HttpError } from "../../middleware/errorHandler";
import { kioskSessionLimit, loginAddressLimit, loginAttemptLimit, sessionRefreshLimit } from "../../middleware/rateLimit";
import { challengeSchema, loginSchema, verifyCodeSchema } from "./schema";
import { createKioskSession, finishLoginWithCode, loginWithPassword, refreshAccessToken, resendLoginCode } from "./service";

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

// Staff/Admin login — Sprint 1. Failed attempts are rate limited (middleware/rateLimit.ts);
// a correct password clears that email's count from this address. With sign-in codes on,
// a correct password answers { codeRequired, challengeId, ... } and nothing else: the
// session starts at /login/verify.
authRouter.post("/login", loginAddressLimit, loginAttemptLimit, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await loginWithPassword(email, password);
    loginAttemptLimit.reset(req);
    if (result.codeRequired) return res.json(result);
    setRefreshCookie(res, result.refreshToken);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
});

// The emailed code (auth/loginCodes.ts). Each sign-in allows 5 wrong codes, and wrong
// codes also count towards this address's limit of rejected sign-ins.
authRouter.post("/login/verify", loginAddressLimit, async (req, res, next) => {
  try {
    const { challengeId, code } = verifyCodeSchema.parse(req.body);
    const { accessToken, refreshToken, user } = await finishLoginWithCode(challengeId, code);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login/resend", loginAddressLimit, async (req, res, next) => {
  try {
    const { challengeId } = challengeSchema.parse(req.body);
    res.json(await resendLoginCode(challengeId));
  } catch (err) {
    next(err);
  }
});

// Silently renews the 15-minute access token using the httpOnly refresh cookie — the
// frontend calls this in the background (apps/web/src/lib/auth.ts) so a staff/admin
// session survives longer than 15 minutes without another password prompt.
authRouter.post("/refresh", sessionRefreshLimit, async (req: Request, res, next) => {
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

// Anonymous kiosk session — used for cart/idle-timeout correlation
authRouter.post("/kiosk-session", kioskSessionLimit, (req, res) => {
  const result = createKioskSession();
  res.json(result);
});
