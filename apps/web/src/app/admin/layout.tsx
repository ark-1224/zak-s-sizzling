import { StaffGuard } from "@/components/StaffGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <StaffGuard>{children}</StaffGuard>;
}
