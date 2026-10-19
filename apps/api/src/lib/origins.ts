/**
 * The web app's addresses, from WEB_ORIGIN: one address, or several separated by commas
 * when the kiosk and the admin side have their own links (see apps/web/src/proxy.ts).
 * Both may call the API (CORS) and open the live socket. The first one is the kiosk's:
 * PayMongo sends a paying customer back there.
 */
const DEFAULT_ORIGIN = "http://localhost:3000";

export function webOrigins(value = process.env.WEB_ORIGIN): string[] {
  const origins = (value ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return origins.length > 0 ? origins : [DEFAULT_ORIGIN];
}

/** The kiosk's address: where a customer comes back to after paying online. */
export function kioskOrigin(value = process.env.WEB_ORIGIN): string {
  return webOrigins(value)[0];
}
