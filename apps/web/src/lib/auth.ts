import type { AuthUser } from "@zaks/shared-types";

const STAFF_TOKEN_KEY = "zaks.staff.accessToken";
const STAFF_USER_KEY = "zaks.staff.user";
const KIOSK_TOKEN_KEY = "zaks.kiosk.sessionToken";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getAccessToken(kind: "staff" | "kiosk"): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(kind === "staff" ? STAFF_TOKEN_KEY : KIOSK_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STAFF_USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(body.error ?? "Login failed");
  }
  const data = (await res.json()) as { accessToken: string; user: AuthUser };
  window.localStorage.setItem(STAFF_TOKEN_KEY, data.accessToken);
  window.localStorage.setItem(STAFF_USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export function logout() {
  window.localStorage.removeItem(STAFF_TOKEN_KEY);
  window.localStorage.removeItem(STAFF_USER_KEY);
}

/** Bootstraps (or reuses) an anonymous kiosk-session token for the customer-facing kiosk. */
export async function ensureKioskSession(): Promise<string> {
  const existing = getAccessToken("kiosk");
  if (existing) return existing;

  const res = await fetch(`${API_URL}/api/auth/kiosk-session`, { method: "POST" });
  const data = (await res.json()) as { token: string; sessionId: string };
  window.localStorage.setItem(KIOSK_TOKEN_KEY, data.token);
  return data.token;
}
