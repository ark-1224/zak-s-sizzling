import type { Metadata } from "next";

// A plain title here would stop the root template reaching checkout/success, so this
// segment repeats it for its child page.
export const metadata: Metadata = { title: { default: "Checkout", template: "%s · Zak's Sizzling Hub" } };

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
