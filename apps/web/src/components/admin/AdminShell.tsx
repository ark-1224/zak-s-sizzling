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
//
// Always a visible sidebar at every screen size (no hidden-behind-hamburger drawer) —
// the target kiosk hardware is a 9" touchscreen (~1024x600) with plenty of width, and
// the requirement is a consistent sidebar layout rather than one that disappears on
// narrower screens. Width and secondary text (group headers, taglines, full user info)
// scale down/hide first; nav link labels themselves stay visible always, wrapping
// rather than truncating if they don't fit on one line.
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

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  return (
    <div className="font-adm-sans flex min-h-screen bg-adm-bg text-adm-ink">
      <aside className="sticky top-0 flex h-screen w-[100px] flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-adm-line bg-adm-surface py-4 sm:w-[180px] sm:gap-5 md:w-61 md:py-5">
        <div className="flex items-center gap-2 px-2.5 sm:gap-2.5 sm:px-4.5">
          <img
            src="/logo.jpg"
            alt="Zak's Sizzling Hub"
            className="h-7 w-7 flex-shrink-0 rounded-[5px] object-cover"
          />
          <div className="hidden min-w-0 sm:block">
            <div className="text-[13.5px] leading-tight font-semibold tracking-tight">Zak&apos;s Sizzling Hub</div>
            <div className="font-adm-mono mt-0.5 text-[10px] text-adm-ink-3">STOCK INVENTORY</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-3 sm:gap-4.5">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((i) => !i.adminOnly || user?.role === "admin");
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="font-adm-mono hidden px-4.5 pb-2 text-[9.5px] tracking-[.16em] text-adm-ink-3 uppercase sm:block">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5 px-1.5 sm:px-2.5">
                  {items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`rounded-[5px] px-1.5 py-2 text-[11px] leading-tight sm:px-2 sm:text-[13px] ${
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

        <div className="px-1.5 sm:px-3.5">
          <div className="flex flex-col gap-2 rounded-[6px] border border-adm-line p-2 sm:gap-2.5 sm:p-3">
            <div className="font-adm-mono hidden text-[9.5px] tracking-[.14em] text-adm-ink-3 uppercase sm:block">
              Signed in as
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-6.5 w-6.5 flex-shrink-0 items-center justify-center rounded-full border border-adm-line bg-adm-surface-2 text-[10px] font-semibold text-adm-ink-2">
                {user?.name?.slice(0, 2).toUpperCase() ?? "—"}
              </div>
              <div className="hidden min-w-0 sm:block">
                <div className="truncate text-xs font-medium">{user?.name ?? "…"}</div>
                <div className="text-[10.5px] text-adm-ink-3 capitalize">{user?.role}</div>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-[5px] border border-adm-line py-1.5 text-[10px] font-medium text-adm-ink-2 sm:text-xs"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-3 sm:p-4.5 md:p-6.5">{children}</main>
    </div>
  );
}
