import type { Metadata } from "next";

export const metadata: Metadata = { title: "Products" };

export default function AdminProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
