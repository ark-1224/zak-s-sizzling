import type { Metadata } from "next";

export const metadata: Metadata = { title: "Market purchases" };

export default function AdminPurchasesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
