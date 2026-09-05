import jwt from "jsonwebtoken";
import type { UserRole } from "@zaks/shared-types";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const KIOSK_SESSION_SECRET = process.env.KIOSK_SESSION_SECRET;

if (!ACCESS_SECRET) throw new Error("JWT_ACCESS_SECRET is not set");
if (!KIOSK_SESSION_SECRET) throw new Error("KIOSK_SESSION_SECRET is not set");

export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
  name: string;
  email: string;
}

export interface KioskSessionPayload {
  sessionId: string;
  role: "customer";
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET!, { expiresIn: "15m" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET!) as AccessTokenPayload;
}

export function signKioskSessionToken(payload: KioskSessionPayload): string {
  // Kiosk sessions are anonymous and longer-lived than staff access tokens —
  // they just need to survive a customer's ordering session at the kiosk.
  return jwt.sign(payload, KIOSK_SESSION_SECRET!, { expiresIn: "2h" });
}

export function verifyKioskSessionToken(token: string): KioskSessionPayload {
  return jwt.verify(token, KIOSK_SESSION_SECRET!) as KioskSessionPayload;
}
