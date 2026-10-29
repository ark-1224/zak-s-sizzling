import type { AuthUser, LoginCodeChallenge } from "@zaks/shared-types";

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

/** The sign-in can't continue (code expired, too many wrong codes...): go back to the password. */
export class LoginStartOverError extends Error {}

async function authPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API_URL}/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // accepts the httpOnly refresh cookie the API sets
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message: string = data.error === "Validation failed" ? "Check what you typed and try again." : (data.error ?? "Login failed");
    throw res.status === 410 ? new LoginStartOverError(message) : new Error(message);
  }
  return (await res.json()) as T;
}

function startSession(data: { accessToken: string; user: AuthUser }): AuthUser {
  storeStaffSession(data.accessToken, data.user);
  scheduleTokenRefresh();
  return data.user;
}

/**
 * Step one: the password. Returns the signed-in user, or, with sign-in codes on (the
 * API's default), where the emailed code went; then call verifyLoginCode.
 */
export async function login(email: string, password: string): Promise<AuthUser | LoginCodeChallenge> {
  const data = await authPost<{ accessToken: string; user: AuthUser } | LoginCodeChallenge>("login", { email, password });
  return "codeRequired" in data ? data : startSession(data);
}

/** Step two: the 6-digit code from the email. */
export async function verifyLoginCode(challengeId: string, code: string): Promise<AuthUser> {
  return startSession(await authPost<{ accessToken: string; user: AuthUser }>("login/verify", { challengeId, code }));
}

export async function resendLoginCode(challengeId: string): Promise<LoginCodeChallenge> {
  return authPost<LoginCodeChallenge>("login/resend", { challengeId });
}

/** The login page, set to come back to the current page (address and query, e.g. the
 *  kitchen display's ?printer=1) after signing in. */
export function loginUrlForCurrentPage(): string {
  const here = window.location.pathname + window.location.search;
  return window.location.pathname === "/login" ? "/login" : `/login?next=${encodeURIComponent(here)}`;
}

/** Where to go after signing in: the ?next= page if it is a page of this site, otherwise
 *  the dashboard. Anything pointing at another site is ignored (no open redirect). */
export function pageAfterLogin(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/admin";
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname === "/login") return "/admin";
    const page = url.pathname + url.search + url.hash;
    // e.g. "/.//evil.example" normalises to "//evil.example", which a browser reads as
    // another site; only a single leading slash is a page of this site.
    return page.startsWith("//") || page.startsWith("/\\") ? "/admin" : page;
  } catch {
    return "/admin";
  }
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

async function mintKioskSession(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/kiosk-session`, { method: "POST" });
  if (!res.ok) throw new Error("Could not start a kiosk session");
  const data = (await res.json()) as { token: string; sessionId: string };
  window.localStorage.setItem(KIOSK_TOKEN_KEY, data.token);
  return data.token;
}

/** Bootstraps (or reuses) an anonymous kiosk-session token for the customer-facing kiosk. */
export async function ensureKioskSession(): Promise<string> {
  const existing = getAccessToken("kiosk");
  if (existing) return existing;
  return mintKioskSession();
}

/**
 * Reactive recovery for apiFetch when a kiosk-authed request 401s. The kiosk session
 * token expires after 2 hours (apps/api/src/lib/jwt.ts) with no refresh mechanism of
 * its own — unlike staff logins, a kiosk tab is meant to stay open for a whole shift,
 * so this will legitimately happen mid-use. Anonymous sessions don't need real
 * re-authentication, just a fresh token; there's nothing to preserve from the old one.
 */
export async function refreshKioskSession(): Promise<string> {
  return mintKioskSession();
}
