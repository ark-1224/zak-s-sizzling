import type { Metadata } from "next";

export const metadata: Metadata = { title: "Categories" };

export default function AdminCategoriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
