import { NextResponse, type NextRequest } from "next/server";

// One web app, deployed twice on Railway so customers and staff get different links:
// - the kiosk site (SITE_ROLE=kiosk): the menu and checkout only
// - the admin site (SITE_ROLE=admin): sign-in, the admin pages, the kitchen display and
//   the payment queue
// Each site sends a visitor who asks for the other side's page to the other site, at the
// same path. Without SITE_ROLE (local development) both sides are served from one
// address, as before. The variables are read when each request arrives, so the same
// build serves either role.
const ADMIN_PATHS = ["/admin", "/staff", "/kitchen", "/login"];
const KIOSK_PATHS = ["/checkout"];

const startsWithAny = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** The other site's address for this path and query, or null when it isn't configured. */
function otherSite(base: string | undefined, request: NextRequest): URL | null {
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
    const target = otherSite(process.env.ADMIN_SITE_URL, request);
    // No admin address configured: these pages simply don't exist on the kiosk site.
    return target ? NextResponse.redirect(target) : new NextResponse("Not found", { status: 404 });
  }

  if (role === "admin") {
    if (pathname === "/") return NextResponse.redirect(new URL("/admin", request.url));
    if (startsWithAny(pathname, KIOSK_PATHS)) {
      const target = otherSite(process.env.KIOSK_SITE_URL, request);
      return target ? NextResponse.redirect(target) : NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Pages only: not Next's own files, images or the icons in public/.
  matcher: ["/((?!_next/|favicon\\.ico|icon\\.jpg|logo\\.jpg|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
