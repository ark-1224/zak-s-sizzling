import { getAccessToken } from "./auth";
import { ApiError, ensureFreshToken } from "./api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Downloads run through fetch (not a plain <a href>) because the endpoint needs the
 *  staff Authorization header — a bare link can't attach one.
 *
 *  Like apiFetch, an expired sign-in is renewed once and the download retried, so a
 *  page left open past the 15-minute token still downloads. Every failure throws an
 *  ApiError with a message the page can show as-is (UI review #12). */
export async function downloadAuthenticated(path: string, filename: string) {
  const request = (token: string | null) =>
    fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  let res: Response;
  try {
    res = await request(getAccessToken("staff"));
    if (res.status === 401) {
      const fresh = await ensureFreshToken().catch(() => null);
      if (fresh) res = await request(fresh);
    }
  } catch {
    throw new ApiError(0, "Couldn't reach the server, so nothing was downloaded. Check the connection, then try again.");
  }

  if (!res.ok) {
    if (res.status === 401) throw new ApiError(401, "Your sign-in has expired. Sign in again, then download the file.");
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? `The download failed (error ${res.status}). Try again.`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
