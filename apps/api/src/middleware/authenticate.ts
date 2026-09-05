import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@zaks/shared-types";
import { verifyAccessToken, verifyKioskSessionToken } from "../lib/jwt";
import { HttpError } from "./errorHandler";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: UserRole; name: string; email: string };
  kioskSessionId?: string;
}

/**
 * Accepts either a staff/admin access token or an anonymous kiosk-session token.
 * Route handlers/authorize() decide which roles are actually allowed.
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "Missing bearer token"));
  }
  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email };
    return next();
  } catch {
    // fall through to kiosk-session check
  }

  try {
    const payload = verifyKioskSessionToken(token);
    req.kioskSessionId = payload.sessionId;
    req.user = { id: payload.sessionId, role: "customer", name: "Kiosk Guest", email: "" };
    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired token"));
  }
}

export function optionalAuthenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}
