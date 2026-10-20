import type { Metadata } from "next";
import { Archivo, Bricolage_Grotesque, Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/hooks/useCart";
import { ToastProvider } from "@/components/kiosk/Toast";

// Customer kiosk type: Bricolage Grotesque for headings, prices and signage-scale text
// (heavy, slightly condensed, like a grill's menu board), Inter for body text.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Admin/back-office typography, ported from the Stock Inventory System UI mockup
// (Downloads/Stock Inventory System UI Mockups) — a deliberately different,
// data-dense "ops dashboard" look distinct from the kiosk's warm branding.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Each page has its own browser-tab title (UI review #27). Pages are client
// components, which can't export metadata, so each route has a small layout.tsx that
// sets just its title; this template adds the name.
export const metadata: Metadata = {
  title: { default: "Menu · Zak's Sizzling Hub", template: "%s · Zak's Sizzling Hub" },
  description: "Self-service ordering kiosk for Zak's Sizzling Hub",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${inter.variable} ${archivo.variable} ${spaceMono.variable} h-full`}
    >
      <body className="min-h-full font-sans antialiased">
        <ToastProvider>
          <CartProvider>{children}</CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
