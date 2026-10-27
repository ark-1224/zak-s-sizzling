import type { Metadata } from "next";

export const metadata: Metadata = { title: "Transactions" };

export default function AdminTransactionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
