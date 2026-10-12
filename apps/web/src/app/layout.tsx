import type { Metadata } from "next";
import { Archivo, Fraunces, Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/hooks/useCart";
import { ToastProvider } from "@/components/kiosk/Toast";

// Fonts ported from kiosk.html's Google Fonts <link> (Downloads/kiosk.html, lines 7-8)
// — used by the customer-facing kiosk only.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${fraunces.variable} ${inter.variable} ${archivo.variable} ${spaceMono.variable} h-full`}
    >
      <body className="min-h-full font-sans antialiased">
        <ToastProvider>
          <CartProvider>{children}</CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
