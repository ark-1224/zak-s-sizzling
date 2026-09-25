import { StaffGuard } from "@/components/StaffGuard";
import { AdminShell } from "@/components/admin/AdminShell";

export default function StaffAreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGuard>
      <AdminShell>{children}</AdminShell>
    </StaffGuard>
  );
}
