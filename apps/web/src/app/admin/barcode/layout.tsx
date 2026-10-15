import type { Metadata } from "next";

export const metadata: Metadata = { title: "Barcode lookup" };

export default function AdminBarcodeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
