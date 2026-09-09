import { StaffGuard } from "@/components/StaffGuard";

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return <StaffGuard>{children}</StaffGuard>;
}
