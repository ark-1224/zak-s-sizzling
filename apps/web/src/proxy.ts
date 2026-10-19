import { NextResponse, type NextRequest } from "next/server";

// One web app, deployed twice on Railway so customers and staff get different links:
// - the kiosk site (SITE_ROLE=kiosk): the menu and checkout only. The staff pages don't
//   exist there: they show the ordinary "page not found", so the kiosk link never points
//   a customer to the admin side.
// - the admin site (SITE_ROLE=admin): sign-in, the admin pages, the kitchen display and
//   the payment queue. Its "/" opens the dashboard, and a checkout page goes to the kiosk
//   site (KIOSK_SITE_URL), where online payments return.
// Without SITE_ROLE (local development) both sides are served from one address, as
// before. The variables are read when each request arrives, so the same build serves
// either role.
const ADMIN_PATHS = ["/admin", "/staff", "/kitchen", "/login"];
const KIOSK_PATHS = ["/checkout"];

const startsWithAny = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** The kiosk site's address for this path and query, or null when it isn't configured. */
function kioskSite(request: NextRequest): URL | null {
  const base = process.env.KIOSK_SITE_URL;
  if (!base) return null;
  try {
    return new URL(request.nextUrl.pathname + request.nextUrl.search, base);
  } catch {
    return null; // a malformed variable must not take the site down
  }
}

export function proxy(request: NextRequest) {
  const role = process.env.SITE_ROLE;
  const { pathname } = request.nextUrl;

  if (role === "kiosk" && startsWithAny(pathname, ADMIN_PATHS)) {
    // A path no page answers to, so the app shows its own 404 page.
    return NextResponse.rewrite(new URL("/page-not-found", request.url));
  }

  if (role === "admin") {
    if (pathname === "/") return NextResponse.redirect(new URL("/admin", request.url));
    if (startsWithAny(pathname, KIOSK_PATHS)) {
      return NextResponse.redirect(kioskSite(request) ?? new URL("/admin", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Pages only: not Next's own files, images or the icons in public/.
  matcher: ["/((?!_next/|favicon\\.ico|icon\\.jpg|logo\\.jpg|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
