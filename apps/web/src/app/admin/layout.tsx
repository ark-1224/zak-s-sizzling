import type { Metadata } from "next";
import { StaffGuard } from "@/components/StaffGuard";
import { AdminRouteGuard } from "@/components/admin/AdminRouteGuard";
import { AdminShell } from "@/components/admin/AdminShell";

// Back-office pages say "Admin" in the tab so they're easy to tell from the kiosk.
export const metadata: Metadata = {
  title: { absolute: "Dashboard · Zak's Sizzling Hub Admin", template: "%s · Zak's Sizzling Hub Admin" },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGuard>
      <AdminShell>
        <AdminRouteGuard>{children}</AdminRouteGuard>
      </AdminShell>
    </StaffGuard>
  );
}
