import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  signAccessToken,
  signKioskSessionToken,
  signRefreshToken,
  verifyAccessToken,
  verifyKioskSessionToken,
  verifyRefreshToken,
} from "../../src/lib/jwt";

const staff = { sub: "user-1", role: "staff" as const, name: "Jane", email: "jane@test.local" };

afterEach(() => {
  vi.useRealTimers();
});

describe("access tokens", () => {
  it("verify returns the payload that was signed", () => {
    const payload = verifyAccessToken(signAccessToken(staff));

    expect(payload).toMatchObject(staff);
  });

  it("expire after 15 minutes", () => {
    const { iat, exp } = jwt.decode(signAccessToken(staff)) as { iat: number; exp: number };

    expect(exp - iat).toBe(15 * 60);
  });

  it("are rejected once expired", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    const token = signAccessToken(staff);

    vi.setSystemTime(new Date("2026-09-28T12:16:00Z"));

    expect(() => verifyAccessToken(token)).toThrow(/expired/);
  });

  it("are rejected if the token was altered", () => {
    const [header, , signature] = signAccessToken(staff).split(".");
    const forgedBody = Buffer.from(JSON.stringify({ ...staff, role: "admin" })).toString("base64url");

    expect(() => verifyAccessToken(`${header}.${forgedBody}.${signature}`)).toThrow(/invalid signature/);
  });
});

describe("token types cannot be swapped", () => {
  it("a kiosk session token is not accepted as a staff access token", () => {
    const kiosk = signKioskSessionToken({ sessionId: "kiosk-1", role: "customer" });

    expect(() => verifyAccessToken(kiosk)).toThrow();
  });

  it("a refresh token is not accepted as an access token", () => {
    const refresh = signRefreshToken({ sub: "user-1" });

    expect(() => verifyAccessToken(refresh)).toThrow();
  });
});

describe("refresh and kiosk tokens", () => {
  it("refresh tokens last 7 days", () => {
    const token = signRefreshToken({ sub: "user-1" });
    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };

    expect(verifyRefreshToken(token).sub).toBe("user-1");
    expect(exp - iat).toBe(7 * 24 * 60 * 60);
  });

  it("kiosk session tokens carry the customer role and last 2 hours", () => {
    const token = signKioskSessionToken({ sessionId: "kiosk-1", role: "customer" });
    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };

    expect(verifyKioskSessionToken(token)).toMatchObject({ sessionId: "kiosk-1", role: "customer" });
    expect(exp - iat).toBe(2 * 60 * 60);
  });
});
