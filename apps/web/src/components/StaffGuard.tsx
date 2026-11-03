"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { logout, loginUrlForCurrentPage, noteStaffActivity, scheduleTokenRefresh, staffIdleTooLong } from "@/lib/auth";
import { useStaffSession } from "@/hooks/useStoredSession";

// Client-side route guard shared by /admin, /staff, and /kitchen. Real enforcement
// always happens server-side via the API's authenticate/authorize middleware — this
// just gives logged-out users a sensible redirect instead of a broken page, and kicks
// off the background access-token refresh (scheduleTokenRefresh) for the session.
// It also notes when someone uses the screen, so the session signs out after 6 hours
// with nobody touching any staff screen (the client's rule; lib/auth.ts).
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel"] as const;
const NOTE_AT_MOST_EVERY_MS = 60_000;

export function StaffGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const signedIn = useStaffSession();

  useEffect(() => {
    if (signedIn === undefined) return; // not read yet
    // Opened again after 6 hours without use: sign in again.
    const idle = signedIn && staffIdleTooLong();
    if (idle) logout();
    if (!signedIn || idle) {
      // Comes back here after signing in (with its query, e.g. /kitchen?printer=1).
      router.replace(loginUrlForCurrentPage());
      return;
    }
    scheduleTokenRefresh();

    let lastNoted = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastNoted < NOTE_AT_MOST_EVERY_MS) return;
      lastNoted = now;
      noteStaffActivity();
    };
    ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, handleActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, handleActivity));
  }, [signedIn, router]);

  if (!signedIn) return null;
  return <>{children}</>;
}
