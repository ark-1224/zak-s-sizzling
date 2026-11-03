// Staff sign-in goes through the admin site's own address, so the browser keeps the
// "stay signed in" cookie. The API runs on another Railway address, which browsers treat
// as another website, and they don't send it a SameSite=Lax cookie from the admin site:
// every renewal failed and staff were signed out within about 15 minutes. This forwards
// sign-in, renewal and sign-out to the API with the cookie, and passes the API's answer
// (and its cookie, which now belongs to this address) back.
//
// The person's address goes along, vouched for by AUTH_PROXY_SECRET (set the same on the
// admin site and the API), so the API's sign-in limits count each person rather than
// this server (apps/api/src/middleware/forwardedClient.ts).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const FORWARDED = new Set(["login", "login/verify", "login/resend", "refresh", "logout"]);
const PASSED_BACK = ["content-type", "retry-after"];

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (!FORWARDED.has(path)) return Response.json({ error: "Not found" }, { status: 404 });
  // Only this site's own pages may sign in, renew or sign out here. Browsers say where a
  // request comes from (Sec-Fetch-Site), so a form or script on another website is
  // refused, and a body that isn't JSON is refused rather than passed on as JSON.
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return Response.json({ error: "Sign in from the admin site's own pages." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Send JSON." }, { status: 415 });
  }

  const headers = new Headers({ "Content-Type": "application/json" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  // Railway's edge adds the caller's address as the last entry (the API trusts the same
  // one hop for its own requests, app.ts).
  const address = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  const secret = process.env.AUTH_PROXY_SECRET;
  if (secret && address) {
    headers.set("X-Auth-Proxy-Secret", secret);
    headers.set("X-Client-Address", address);
  }

  let answer: Response;
  try {
    answer = await fetch(`${API_URL}/api/auth/${path}`, { method: "POST", headers, body: await request.text(), cache: "no-store" });
  } catch {
    return Response.json({ error: "The server didn't respond. Check the connection, then try again." }, { status: 502 });
  }

  const passed = new Headers();
  for (const name of PASSED_BACK) {
    const value = answer.headers.get(name);
    if (value) passed.set(name, value);
  }
  for (const setCookie of answer.headers.getSetCookie()) passed.append("Set-Cookie", setCookie);
  return new Response(answer.status === 204 ? null : await answer.text(), { status: answer.status, headers: passed });
}
