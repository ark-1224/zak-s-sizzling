"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginUrlForCurrentPage, scheduleTokenRefresh } from "@/lib/auth";
import { useStaffSession } from "@/hooks/useStoredSession";

// Client-side route guard shared by /admin, /staff, and /kitchen. Real enforcement
// always happens server-side via the API's authenticate/authorize middleware — this
// just gives logged-out users a sensible redirect instead of a broken page, and kicks
// off the background access-token refresh (scheduleTokenRefresh) for the session.
export function StaffGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const signedIn = useStaffSession();

  useEffect(() => {
    if (signedIn === undefined) return; // not read yet
    if (!signedIn) {
      // Comes back here after signing in (with its query, e.g. /kitchen?printer=1).
      router.replace(loginUrlForCurrentPage());
      return;
    }
    scheduleTokenRefresh();
  }, [signedIn, router]);

  if (!signedIn) return null;
  return <>{children}</>;
}
