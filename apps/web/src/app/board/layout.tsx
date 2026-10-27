import type { Metadata } from "next";

export const metadata: Metadata = { title: "Order status" };

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
