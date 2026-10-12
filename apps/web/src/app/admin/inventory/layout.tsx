import type { Metadata } from "next";

export const metadata: Metadata = { title: "Inventory" };

export default function AdminInventoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
