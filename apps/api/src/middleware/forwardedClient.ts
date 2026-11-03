import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Staff sign-in reaches the API through the admin site (apps/web/src/app/api/auth/
 * [...path]/route.ts), so the request comes from that server, not from the person
 * signing in. The admin site sends the person's address along, with AUTH_PROXY_SECRET
 * to vouch for it; with the right secret, req.ip becomes that address, so the sign-in
 * limits (middleware/rateLimit.ts) count each person instead of lumping everyone in
 * together. Without the secret (or with a wrong one) the header is ignored, so nobody
 * else can choose the address they are counted under.
 */
export function forwardedClientAddress(req: Request, _res: Response, next: NextFunction) {
  const secret = process.env.AUTH_PROXY_SECRET;
  const given = req.get("x-auth-proxy-secret");
  const address = req.get("x-client-address")?.trim();
  if (secret && given && address && sameSecret(given, secret)) {
    Object.defineProperty(req, "ip", { value: address.slice(0, 64), configurable: true });
  }
  next();
}

function sameSecret(given: string, secret: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
