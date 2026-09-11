import type { AuthUser } from "@zaks/shared-types";

const STAFF_TOKEN_KEY = "zaks.staff.accessToken";
const STAFF_USER_KEY = "zaks.staff.user";
const KIOSK_TOKEN_KEY = "zaks.kiosk.sessionToken";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// The access token expires after 15 minutes server-side (apps/api/src/lib/jwt.ts) —
// refreshing at 12 leaves a comfortable buffer for clock drift and in-flight requests
// while still renewing well before it'd ever actually expire during active use.
const REFRESH_INTERVAL_MS = 12 * 60 * 1000;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function getAccessToken(kind: "staff" | "kiosk"): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(kind === "staff" ? STAFF_TOKEN_KEY : KIOSK_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STAFF_USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

function storeStaffSession(accessToken: string, user: AuthUser) {
  window.localStorage.setItem(STAFF_TOKEN_KEY, accessToken);
  window.localStorage.setItem(STAFF_USER_KEY, JSON.stringify(user));
}

/** Local-only cleanup — used both by logout() and by apiFetch when a refresh attempt fails. */
export function clearStaffSession() {
  window.localStorage.removeItem(STAFF_TOKEN_KEY);
  window.localStorage.removeItem(STAFF_USER_KEY);
  clearScheduledRefresh();
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // accepts the httpOnly refresh cookie the API sets
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(body.error ?? "Login failed");
  }
  const data = (await res.json()) as { accessToken: string; user: AuthUser };
  storeStaffSession(data.accessToken, data.user);
  scheduleTokenRefresh();
  return data.user;
}

export function logout() {
  // Best-effort — clears the httpOnly refresh cookie server-side. Not awaited: the
  // caller navigates to /login immediately regardless, and the cookie is scoped to
  // /api/auth and expires in 7 days on its own even if this request never lands.
  fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
  clearStaffSession();
}

/**
 * Silently exchanges the httpOnly refresh cookie for a new access token. Used both
 * proactively (scheduleTokenRefresh, below) and reactively (api-client.ts, on a 401)
 * so a staff/admin session survives well past the access token's 15-minute lifetime
 * without another login prompt — until the refresh token itself expires (7 days) or
 * the account is suspended, at which point this throws and the caller sends the user
 * back to /login.
 */
export async function refreshAccessToken(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    clearStaffSession();
    throw new Error("Session expired");
  }
  const data = (await res.json()) as { accessToken: string; user: AuthUser };
  storeStaffSession(data.accessToken, data.user);
  return data.accessToken;
}

/** Idempotent — safe to call from every StaffGuard mount without stacking timers. */
export function scheduleTokenRefresh() {
  clearScheduledRefresh();
  refreshTimer = setTimeout(async () => {
    try {
      await refreshAccessToken();
      scheduleTokenRefresh();
    } catch {
      // Refresh token expired/invalid/suspended — leave it; the next authenticated
      // API call's reactive 401 handling (api-client.ts) will send the user to /login.
    }
  }, REFRESH_INTERVAL_MS);
}

export function clearScheduledRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
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
