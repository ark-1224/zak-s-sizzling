"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getStoredUser, logout } from "@/lib/auth";
import type { AuthUser } from "@zaks/shared-types";

// Admin/back-office shell — sidebar + content frame, ported from the Stock Inventory
// System UI mockup's persistent nav pattern (Downloads/Stock Inventory System UI
// Mockups). Role names kept as our own (admin/staff), not the mockup's kiosk/admin/
// super — see the manuscript's User Level Diagram, which this schema already matches.
interface NavItem {
  href: string;
  label: string;
  adminOnly?: boolean;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/products", label: "Products" },
      { href: "/admin/inventory", label: "Inventory" },
      { href: "/admin/import", label: "Bulk import" },
    ],
  },
  {
    label: "Sales",
    items: [{ href: "/admin/analytics", label: "Analytics" }],
  },
  {
    label: "Front of house",
    items: [
      { href: "/kitchen", label: "Kitchen display" },
      { href: "/staff/orders", label: "Orders awaiting payment" },
    ],
  },
  {
    label: "Administration",
    items: [{ href: "/admin/users", label: "Users & roles", adminOnly: true }],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  // Sidebar is a fixed 244px column on desktop but becomes a slide-in drawer below
  // md — the same fixed-width-sidebar pattern was eating most of the viewport on a
  // phone, since nothing here was built mobile-first (this app's primary target is a
  // large kiosk touchscreen, not a phone), but panelists/staff opening it on a small
  // screen shouldn't see a broken layout.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="font-adm-sans flex min-h-screen flex-col bg-adm-bg text-adm-ink md:flex-row">
      <div className="sticky top-0 z-30 flex h-13 flex-shrink-0 items-center gap-3 border-b border-adm-line bg-adm-surface px-4 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-8 w-8 items-center justify-center rounded-[5px] border border-adm-line text-adm-ink-2"
        >
          <span className="font-adm-mono text-sm">☰</span>
        </button>
        <div className="text-[13.5px] font-semibold tracking-tight">Zak&apos;s Sizzling Hub</div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[#141310]/45 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex h-screen w-61 flex-shrink-0 flex-col gap-5 border-r border-adm-line bg-adm-surface py-5 transition-transform duration-200 md:sticky md:z-auto md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-4.5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[5px] bg-adm-accent">
            <span className="font-adm-mono text-[11px] font-bold text-white">ZK</span>
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] leading-tight font-semibold tracking-tight">Zak&apos;s Sizzling Hub</div>
            <div className="font-adm-mono mt-0.5 text-[10px] text-adm-ink-3">STOCK INVENTORY</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-4.5 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((i) => !i.adminOnly || user?.role === "admin");
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="font-adm-mono px-4.5 pb-2 text-[9.5px] tracking-[.16em] text-adm-ink-3 uppercase">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5 px-2.5">
                  {items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`rounded-[5px] px-2 py-2 text-[13px] ${
                          active ? "bg-adm-accent-soft font-medium text-adm-accent" : "text-adm-ink-2"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="px-3.5">
          <div className="flex flex-col gap-2.5 rounded-[6px] border border-adm-line p-3">
            <div className="font-adm-mono text-[9.5px] tracking-[.14em] text-adm-ink-3 uppercase">Signed in as</div>
            <div className="flex items-center gap-2">
              <div className="flex h-6.5 w-6.5 flex-shrink-0 items-center justify-center rounded-full border border-adm-line bg-adm-surface-2 text-[10px] font-semibold text-adm-ink-2">
                {user?.name?.slice(0, 2).toUpperCase() ?? "—"}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{user?.name ?? "…"}</div>
                <div className="text-[10.5px] text-adm-ink-3 capitalize">{user?.role}</div>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-[5px] border border-adm-line py-1.5 text-xs font-medium text-adm-ink-2"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6.5">{children}</main>
    </div>
  );
}
