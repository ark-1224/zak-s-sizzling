import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import type { UserRole } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { signAccessToken, signKioskSessionToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt";
import { HttpError } from "../../middleware/errorHandler";

function issueSession(user: { id: string; name: string; email: string; role: { name: UserRole } }) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role.name,
    name: user.name,
    email: user.email,
  });
  const refreshToken = signRefreshToken({ sub: user.id });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role.name },
  };
}

export async function loginWithPassword(email: string, password: string) {
  // Emails are stored/compared lowercase so "Staff@Zaks.com" and "staff@zaks.com"
  // aren't treated as different accounts — Postgres varchar comparison is otherwise
  // case-sensitive.
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { role: true } });
  if (!user || !user.isActive) throw new HttpError(401, "Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Invalid email or password");

  return issueSession(user);
}

/**
 * Verifies the httpOnly refresh cookie and issues a fresh access token (and a rotated
 * refresh token, so a stolen refresh token has a shrinking window of use). Re-checking
 * the user record here — not just the token signature — is what makes a suspended or
 * role-changed account actually lose access within one refresh cycle, instead of
 * keeping whatever role was baked into the token at login time for up to 7 days.
 */
export async function refreshAccessToken(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, "Invalid or expired session");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
  if (!user || !user.isActive) throw new HttpError(401, "Invalid or expired session");

  return issueSession(user);
}

export function createKioskSession() {
  const sessionId = randomUUID();
  const token = signKioskSessionToken({ sessionId, role: "customer" });
  return { token, sessionId };
}
