import { StaffGuard } from "@/components/StaffGuard";

export default function StaffAreaLayout({ children }: { children: React.ReactNode }) {
  return <StaffGuard>{children}</StaffGuard>;
}
