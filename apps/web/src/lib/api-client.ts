import { clearStaffSession, getAccessToken, refreshAccessToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Multiple components can 401 around the same moment (e.g. analytics firing four
// requests in parallel) — sharing one in-flight refresh instead of racing several
// keeps a single valid refresh token in play and avoids piling up redundant calls.
let refreshInFlight: Promise<string> | null = null;
function ensureFreshToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: "staff" | "kiosk" | "none" } = {}
): Promise<T> {
  const { auth = "none", headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (auth !== "none") {
    const token = getAccessToken(auth);
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });

  // A 401 on a staff/admin call almost always just means the 15-minute access token
  // expired mid-session — silently renew it via the refresh cookie and retry once
  // before giving up. The request never reached the route handler (auth middleware
  // runs first), so nothing has happened server-side yet and retrying is safe even
  // for POST/PATCH/DELETE.
  if (res.status === 401 && auth === "staff") {
    try {
      const newToken = await ensureFreshToken();
      finalHeaders.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });
    } catch {
      // Refresh itself failed — session is genuinely gone (expired past 7 days,
      // suspended, etc). Fall through to the normal error path below.
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401 && auth === "staff") {
      clearStaffSession();
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    throw new ApiError(res.status, body.error ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
