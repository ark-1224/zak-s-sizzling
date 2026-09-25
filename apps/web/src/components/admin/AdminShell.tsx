"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getStoredUser, logout } from "@/lib/auth";
import { Icon, type IconName } from "@/components/Icon";
import type { AuthUser } from "@zaks/shared-types";

// Admin/back-office shell — sidebar + content frame, ported from the Stock Inventory
// System UI mockup's persistent nav pattern (Downloads/Stock Inventory System UI
// Mockups).
//
// The sidebar is visible at every width (an adviser/panel requirement): below md it
// collapses to a 64px icon rail, from md up it's the full 256px sidebar with labels.
// Because `title` tooltips never appear on touchscreens, the rail has a menu button
// that opens the same nav as a labelled overlay panel — the rail itself stays put.
interface NavItem {
  href: string;
  label: string;
  icon: IconName;
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
      { href: "/admin", label: "Dashboard", icon: "dashboard" },
      { href: "/admin/products", label: "Products", icon: "products" },
      { href: "/admin/inventory", label: "Inventory", icon: "inventory" },
      { href: "/admin/import", label: "Bulk import", icon: "import" },
    ],
  },
  {
    label: "Sales",
    items: [{ href: "/admin/analytics", label: "Analytics", icon: "analytics" }],
  },
  {
    label: "Front of house",
    items: [
      { href: "/kitchen", label: "Kitchen display", icon: "kitchen" },
      { href: "/staff/orders", label: "Orders awaiting payment", icon: "orders" },
    ],
  },
  {
    label: "Administration",
    items: [{ href: "/admin/users", label: "Users & roles", icon: "users", adminOnly: true }],
  },
];

// Full class strings per mode (never concatenated fragments) so Tailwind can see them.
// "rail" = the always-visible sidebar (icon-only below md, labelled from md up);
// "panel" = the mobile overlay, which always shows labels.
const MODE = {
  rail: {
    text: "hidden md:block",
    label: "hidden md:inline",
    link: "justify-center md:justify-start",
    userBox: "items-center md:items-stretch md:rounded-md md:border md:border-adm-line md:p-3",
    logout: "w-11 md:w-full",
  },
  panel: {
    text: "block",
    label: "inline",
    link: "justify-start",
    userBox: "items-stretch rounded-md border border-adm-line p-3",
    logout: "w-full",
  },
} as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="font-adm-sans flex min-h-dvh bg-adm-bg text-adm-ink">
      <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col overflow-y-auto border-r border-adm-line bg-adm-surface md:w-64">
        <SidebarContent
          mode="rail"
          pathname={pathname}
          user={user}
          onLogout={handleLogout}
          onOpenMenu={() => setExpanded(true)}
        />
      </aside>

      {expanded && (
        <>
          <div className="fixed inset-0 z-30 bg-adm-ink/40 md:hidden" onClick={() => setExpanded(false)} aria-hidden="true" />
          <aside
            className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto bg-adm-surface shadow-2xl md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <SidebarContent
              mode="panel"
              pathname={pathname}
              user={user}
              onLogout={handleLogout}
              onClose={() => setExpanded(false)}
            />
          </aside>
        </>
      )}

      <main className="min-w-0 flex-1 p-3 md:p-6">{children}</main>
    </div>
  );
}

function SidebarContent({
  mode,
  pathname,
  user,
  onLogout,
  onOpenMenu,
  onClose,
}: {
  mode: keyof typeof MODE;
  pathname: string;
  user: AuthUser | null;
  onLogout: () => void;
  onOpenMenu?: () => void;
  onClose?: () => void;
}) {
  const m = MODE[mode];

  return (
    <div className="flex flex-1 flex-col gap-4 px-2 py-3 md:gap-5 md:px-3 md:py-5">
      <div className="flex items-center justify-center gap-2.5 md:justify-start md:px-1.5">
        <img src="/logo.jpg" alt="Zak's Sizzling Hub" className="h-8 w-8 rounded-md object-cover" />
        <div className={`min-w-0 flex-1 ${m.text}`}>
          <div className="truncate text-sm leading-tight font-semibold tracking-tight">Zak&apos;s Sizzling Hub</div>
          <div className="font-adm-mono mt-0.5 text-xs text-adm-ink-3 md:text-[10px]">STOCK INVENTORY</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            autoFocus
            aria-label="Close navigation menu"
            title="Close menu"
            className="flex h-11 w-11 items-center justify-center rounded-md text-adm-ink-2"
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      {onOpenMenu && (
        <button
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          title="Show menu labels"
          className="flex h-11 w-full items-center justify-center rounded-md border border-adm-line text-adm-ink-2 md:hidden"
        >
          <Icon name="menu" />
        </button>
      )}

      <nav className="flex flex-1 flex-col gap-3 md:gap-4" aria-label="Main">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || user?.role === "admin");
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <div className={`font-adm-mono px-3 pb-1.5 text-xs tracking-[.16em] text-adm-ink-3 uppercase md:text-[9.5px] ${m.text}`}>
                {group.label}
              </div>
              <div className="flex flex-col gap-1">
                {items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-label={item.label}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-base md:text-sm ${m.link} ${
                        active ? "bg-adm-accent-soft font-medium text-adm-accent" : "text-adm-ink-2"
                      }`}
                    >
                      <Icon name={item.icon} />
                      <span className={m.label}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className={`flex flex-col gap-2 ${m.userBox}`}>
        <div className={`font-adm-mono text-xs tracking-[.14em] text-adm-ink-3 uppercase md:text-[9.5px] ${m.text}`}>
          Signed in as
        </div>
        <div className="flex items-center gap-2" title={user?.name}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-adm-line bg-adm-surface-2 text-xs font-semibold text-adm-ink-2">
            {user?.name?.slice(0, 2).toUpperCase() ?? "—"}
          </div>
          <div className={`min-w-0 ${m.text}`}>
            <div className="truncate text-sm font-medium">{user?.name ?? "…"}</div>
            <div className="text-xs text-adm-ink-3 capitalize">{user?.role}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          className={`flex min-h-11 items-center justify-center gap-2 rounded-md border border-adm-line text-sm font-medium text-adm-ink-2 ${m.logout}`}
        >
          <Icon name="logout" className="h-4.5 w-4.5" />
          <span className={m.label}>Log out</span>
        </button>
      </div>
    </div>
  );
}
