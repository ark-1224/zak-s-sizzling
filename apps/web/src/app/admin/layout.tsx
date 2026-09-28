import { StaffGuard } from "@/components/StaffGuard";
import { AdminRouteGuard } from "@/components/admin/AdminRouteGuard";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGuard>
      <AdminShell>
        <AdminRouteGuard>{children}</AdminRouteGuard>
      </AdminShell>
    </StaffGuard>
  );
}
