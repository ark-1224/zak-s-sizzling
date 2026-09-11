"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, getStoredUser, scheduleTokenRefresh } from "@/lib/auth";

// Client-side route guard shared by /admin, /staff, and /kitchen. Real enforcement
// always happens server-side via the API's authenticate/authorize middleware — this
// just gives logged-out users a sensible redirect instead of a broken page, and kicks
// off the background access-token refresh (scheduleTokenRefresh) for the session.
export function StaffGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getAccessToken("staff");
    const user = getStoredUser();
    if (!token || !user || (user.role !== "admin" && user.role !== "staff")) {
      router.replace("/login");
      return;
    }
    scheduleTokenRefresh();
    setChecked(true);
  }, [router]);

  if (!checked) return null;
  return <>{children}</>;
}
