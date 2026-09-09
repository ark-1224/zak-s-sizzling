"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStoredUser, logout } from "@/lib/auth";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@zaks/shared-types";

const LINKS = [
  { href: "/admin/products", label: "Products", blurb: "Add, edit, and manage the menu catalog" },
  { href: "/admin/inventory", label: "Inventory", blurb: "Stock levels, adjustments, low-stock alerts" },
  { href: "/admin/analytics", label: "Analytics", blurb: "Sales, top sellers, inventory movement, export" },
  { href: "/kitchen", label: "Kitchen Display", blurb: "Real-time order prep queue" },
  { href: "/staff/orders", label: "Orders awaiting payment", blurb: "Confirm counter payments" },
];

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  return (
    <div className="min-h-screen bg-cream p-8">
      <h1 className="font-display text-2xl font-semibold text-matcha-deep">Admin Dashboard</h1>
      {user && (
        <p className="mt-2 text-ink-soft">
          Signed in as <strong>{user.name}</strong> ({user.role})
        </p>
      )}

      <div className="mt-6 grid max-w-xl gap-3">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-line bg-white p-4 transition-colors hover:border-matcha"
          >
            <div className="font-semibold text-matcha-deep">{link.label}</div>
            <div className="text-sm text-ink-soft">{link.blurb}</div>
          </Link>
        ))}
      </div>

      <button
        onClick={() => {
          logout();
          router.replace("/login");
        }}
        className="mt-6 rounded-full bg-matcha px-5 py-2 text-sm font-semibold text-cream"
      >
        Log out
      </button>
    </div>
  );
}
