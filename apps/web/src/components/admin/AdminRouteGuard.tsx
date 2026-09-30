"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/auth";

// Pages only the Administrator may open. Staff who reach one (typed URL, old bookmark)
// are sent back to the dashboard before the page mounts, so it never fires requests
// the API would reject. Real enforcement is the API's authorize("admin") on the same
// features — this only keeps staff out of screens they can't use. Keep this list in
// sync with the adminOnly items in AdminShell's NAV_GROUPS.
const ADMIN_ONLY_PATHS = ["/admin/products", "/admin/import", "/admin/analytics", "/admin/users", "/admin/kiosk-qr"];

const isAdminOnly = (pathname: string) => ADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin] = useState(() => getStoredUser()?.role === "admin");
  const blocked = isAdminOnly(pathname) && !isAdmin;

  useEffect(() => {
    if (blocked) router.replace("/admin");
  }, [blocked, router]);

  if (blocked) return null;
  return <>{children}</>;
}
