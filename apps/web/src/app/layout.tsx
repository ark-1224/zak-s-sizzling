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

export const metadata: Metadata = {
  title: "Zak's Sizzling Hub — Order Kiosk",
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
