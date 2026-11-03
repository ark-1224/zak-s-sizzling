import type { AuthUser, LoginCodeChallenge } from "@zaks/shared-types";

const STAFF_TOKEN_KEY = "zaks.staff.accessToken";
const STAFF_USER_KEY = "zaks.staff.user";
const KIOSK_TOKEN_KEY = "zaks.kiosk.sessionToken";
/** When someone last used a staff screen (any tab), so an idle one signs out. */
const LAST_ACTIVE_KEY = "zaks.staff.lastActive";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// The access token expires after 15 minutes server-side (apps/api/src/lib/jwt.ts) —
// refreshing at 12 leaves a comfortable buffer for clock drift and in-flight requests
// while still renewing well before it'd ever actually expire during active use.
const REFRESH_INTERVAL_MS = 12 * 60 * 1000;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The client's rule: a staff screen nobody has touched for 6 hours signs out. Within it
 * the session is renewed in the background however long the screen sits untouched;
 * after it, renewal stops and the next sign-in needs the password and emailed code. The
 * API's renewal cookie lasts as long (REFRESH_TOKEN_HOURS), so a closed browser follows
 * the same rule.
 */
export const STAFF_IDLE_LIMIT_MS = 6 * 60 * 60 * 1000;

/** Someone used a staff screen: the 6 hours start again. */
export function noteStaffActivity() {
  window.localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
}

/** True once nobody has used a staff screen for STAFF_IDLE_LIMIT_MS. */
export function staffIdleTooLong(): boolean {
  const last = Number(window.localStorage.getItem(LAST_ACTIVE_KEY));
  // Sessions from before this was recorded count from now.
  if (!last) {
    noteStaffActivity();
    return false;
  }
  return Date.now() - last > STAFF_IDLE_LIMIT_MS;
}

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

// Sign-in, renewal and sign-out go to this site's own address, which forwards them to
// the API (app/api/auth/[...path]/route.ts): the renewal cookie then belongs to this
// site, so the browser sends it back. Other API calls go straight to the API.
const authUrl = (path: string) => `/api/auth/${path}`;
/** Renewal and sign-out carry no data, but the forwarding route only accepts JSON. */
const EMPTY_JSON = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" } as const;

/** Local-only cleanup — used both by logout() and by apiFetch when a refresh attempt fails. */
export function clearStaffSession() {
  window.localStorage.removeItem(STAFF_TOKEN_KEY);
  window.localStorage.removeItem(STAFF_USER_KEY);
  window.localStorage.removeItem(LAST_ACTIVE_KEY);
  clearScheduledRefresh();
}

/** The sign-in can't continue (code expired, too many wrong codes...): go back to the password. */
export class LoginStartOverError extends Error {}

async function authPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(authUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  noteStaffActivity();
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
  // /api/auth and expires in 6 hours on its own even if this request never lands.
  fetch(authUrl("logout"), EMPTY_JSON).catch(() => {});
  clearStaffSession();
}

/**
 * Silently exchanges the httpOnly refresh cookie for a new access token. Used both
 * proactively (scheduleTokenRefresh, below) and reactively (api-client.ts, on a 401)
 * so a staff/admin session survives well past the access token's 15-minute lifetime
 * without another login prompt — until nobody has used a staff screen for 6 hours, the
 * refresh token itself expires (6 hours after the last renewal) or the account is
 * suspended, at which point this throws and the caller sends the user back to /login.
 */
export async function refreshAccessToken(): Promise<string> {
  // Signed out already (a request still running when the screen signed out must not
  // start the session again), or idle for 6 hours.
  if (!getStoredUser()) throw new Error("Signed out");
  if (staffIdleTooLong()) {
    logout();
    throw new Error("Signed out after 6 hours without use");
  }
  const res = await fetch(authUrl("refresh"), EMPTY_JSON);
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
      // Idle for 6 hours, or the refresh token expired or the account was suspended:
      // go to the sign-in page now, so an untouched screen doesn't sit there signed out.
      window.location.href = loginUrlForCurrentPage();
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
