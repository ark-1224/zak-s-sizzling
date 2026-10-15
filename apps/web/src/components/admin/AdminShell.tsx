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
// collapses to a 64px rail, from md up it's the full 256px sidebar with labels. On the
// rail each icon has a short name under it (UI review #25), since `title` tooltips never
// appear on touchscreens; its menu button still opens the full nav as an overlay panel,
// with group names and who is signed in.
interface NavItem {
  href: string;
  label: string;
  /** Under the icon on the phone rail: one word that fits 56px at 11px. */
  short: string;
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
      { href: "/admin", label: "Dashboard", short: "Dashboard", icon: "dashboard" },
      { href: "/admin/products", label: "Products", short: "Products", icon: "products", adminOnly: true },
      { href: "/admin/inventory", label: "Inventory", short: "Inventory", icon: "inventory" },
      { href: "/admin/raw-materials", label: "Raw materials", short: "Materials", icon: "materials" },
      { href: "/admin/barcode", label: "Barcode lookup", short: "Barcode", icon: "barcode" },
      { href: "/admin/import", label: "Bulk import", short: "Import", icon: "import", adminOnly: true },
    ],
  },
  {
    label: "Sales",
    items: [{ href: "/admin/analytics", label: "Analytics", short: "Analytics", icon: "analytics", adminOnly: true }],
  },
  {
    label: "Front of house",
    items: [
      { href: "/kitchen", label: "Kitchen display", short: "Kitchen", icon: "kitchen" },
      { href: "/staff/orders", label: "Orders awaiting payment", short: "Orders", icon: "orders" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users & roles", short: "Users", icon: "users", adminOnly: true },
      { href: "/admin/kiosk-qr", label: "Kiosk QR code", short: "QR code", icon: "qr", adminOnly: true },
    ],
  },
];

// Full class strings per mode (never concatenated fragments) so Tailwind can see them.
// "rail" = the always-visible sidebar (icon over a short name below md, the full sidebar
// from md up); "panel" = the mobile overlay, which always shows full labels.
const MODE = {
  rail: {
    content: "px-1 md:px-3",
    text: "hidden md:block",
    label: "hidden md:inline",
    short: "text-[11px] leading-tight md:hidden",
    stack: "flex-col justify-center gap-0.5 px-0 py-1.5 md:flex-row md:justify-start md:gap-3 md:px-3 md:py-0",
    userBox: "items-center md:items-stretch md:rounded-md md:border md:border-adm-line md:p-3",
    logout: "w-full flex-col gap-0.5 py-1.5 md:flex-row md:gap-2 md:py-0",
    logoutLabel: "text-[11px] leading-tight md:text-sm",
  },
  panel: {
    content: "px-3",
    text: "block",
    label: "inline",
    short: "hidden",
    stack: "justify-start gap-3 px-3",
    userBox: "items-stretch rounded-md border border-adm-line p-3",
    logout: "w-full gap-2",
    logoutLabel: "",
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
    <div className={`flex flex-1 flex-col gap-4 py-3 md:gap-5 md:py-5 ${m.content}`}>
      <div className="flex items-center justify-center gap-2.5 md:justify-start md:px-1.5">
        <img src="/logo.jpg" alt="Zak's Sizzling Hub" className="h-8 w-8 rounded-md object-cover" />
        <div className={`min-w-0 flex-1 ${m.text}`}>
          <div className="truncate text-sm leading-tight font-semibold tracking-tight">Zak&apos;s Sizzling Hub</div>
          <div className="font-adm-mono mt-0.5 text-xs text-adm-ink-3">STOCK INVENTORY</div>
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
          className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md border border-adm-line py-1.5 text-adm-ink-2 md:hidden"
        >
          <Icon name="menu" />
          <span className="text-[11px] leading-tight">Menu</span>
        </button>
      )}

      <nav className="flex flex-1 flex-col gap-3 md:gap-4" aria-label="Main">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || user?.role === "admin");
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <div className={`font-adm-mono px-3 pb-1.5 text-xs tracking-[.16em] text-adm-ink-3 uppercase ${m.text}`}>
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
                      className={`flex min-h-11 items-center rounded-md text-base md:text-sm ${m.stack} ${
                        active ? "bg-adm-accent-soft font-medium text-adm-accent" : "text-adm-ink-2"
                      }`}
                    >
                      <Icon name={item.icon} />
                      <span className={m.label}>{item.label}</span>
                      {/* Accent on its tint is 4.3:1, short of 4.5:1 for small text, so the active name is ink. */}
                      <span className={`${m.short} ${active ? "text-adm-ink" : ""}`}>{item.short}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className={`flex flex-col gap-2 ${m.userBox}`}>
        <div className={`font-adm-mono text-xs tracking-[.14em] text-adm-ink-3 uppercase ${m.text}`}>
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
          className={`flex min-h-11 items-center justify-center rounded-md border border-adm-line text-sm font-medium text-adm-ink-2 ${m.logout}`}
        >
          <Icon name="logout" className="h-4.5 w-4.5" />
          <span className={m.logoutLabel}>Log out</span>
        </button>
      </div>
    </div>
  );
}
