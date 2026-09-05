import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { signAccessToken, signKioskSessionToken } from "../../lib/jwt";
import { HttpError } from "../../middleware/errorHandler";

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
  if (!user || !user.isActive) throw new HttpError(401, "Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Invalid email or password");

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role.name,
    name: user.name,
    email: user.email,
  });

  return {
    accessToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role.name },
  };
}

export function createKioskSession() {
  const sessionId = randomUUID();
  const token = signKioskSessionToken({ sessionId, role: "customer" });
  return { token, sessionId };
}
