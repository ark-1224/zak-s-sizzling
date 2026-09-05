import type { NextFunction, Response } from "express";
import type { UserRole } from "@zaks/shared-types";
import type { AuthenticatedRequest } from "./authenticate";
import { HttpError } from "./errorHandler";

export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Not authenticated"));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new HttpError(403, "Insufficient permissions"));
    }
    return next();
  };
}
