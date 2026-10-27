// Hand-drawn inline SVG icons for the icon-only sidebar rail — no icon library dependency.
// Stroke uses currentColor so each icon inherits the link's text color (including the
// active-state accent).
export type IconName =
  | "dashboard"
  | "products"
  | "inventory"
  | "materials"
  | "barcode"
  | "import"
  | "analytics"
  | "kitchen"
  | "orders"
  | "users"
  | "qr"
  | "logout"
  | "menu"
  | "close"
  | "plus"
  | "check"
  | "chevronDown"
  | "chevronRight"
  | "search"
  | "minus"
  | "dineIn"
  | "takeOut"
  | "restart"
  | "cash"
  | "phone"
  | "history"
  | "categories";

const SHAPES: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </>
  ),
  products: (
    <>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-7.7 7.7a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7z" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  inventory: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  materials: (
    <>
      <path d="M8 3.5h8M9.5 3.5v3L5.5 11v8a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-8l-4-4.5v-3" />
      <path d="M5.5 13.5h13" />
    </>
  ),
  barcode: (
    <>
      <path d="M3.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2M17 3.5h2A1.5 1.5 0 0 1 20.5 5v2M20.5 17v2a1.5 1.5 0 0 1-1.5 1.5h-2M7 20.5H5A1.5 1.5 0 0 1 3.5 19v-2" />
      <path d="M7.5 8v8M10 8v8M13 8v8M16.5 8v8" />
    </>
  ),
  import: (
    <>
      <path d="M12 3.5v11" />
      <path d="m7.5 10 4.5 4.5 4.5-4.5" />
      <path d="M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20.5h16" />
      <rect x="5.5" y="11" width="3" height="6.5" rx=".5" />
      <rect x="10.5" y="6" width="3" height="11.5" rx=".5" />
      <rect x="15.5" y="13.5" width="3" height="4" rx=".5" />
    </>
  ),
  kitchen: (
    <path d="M12 21a6 6 0 0 0 6-6c0-4-3-5.5-4-9.5-2.5 1.5-3.5 4-3 6.5-1-.5-1.8-1.5-2-3C7.5 10.5 6 12.5 6 15a6 6 0 0 0 6 6z" />
  ),
  orders: (
    <>
      <path d="M6.5 3.5h11v17l-2.75-1.75L12 20.5l-2.75-1.75L6.5 20.5z" />
      <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4" />
      <path d="M17.5 14.8c2 .6 3.5 2.4 3.5 5.2" />
    </>
  ),
  qr: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5H14zM18 14h2.5M14 18v2.5M17.5 18h3v2.5h-3z" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="m9.5 16.5-4.5-4.5 4.5-4.5" />
      <path d="M5 12h10.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.6-4.6" />
    </>
  ),
  // A plate between a fork and a knife.
  dineIn: (
    <>
      <circle cx="12" cy="12.5" r="5.5" />
      <circle cx="12" cy="12.5" r="2.5" />
      <path d="M3.5 4v5a1.5 1.5 0 0 0 3 0V4M5 9.5V20" />
      <path d="M20.5 20V4c-1.7.6-2.5 2.6-2.5 5v3.5h2.5" />
    </>
  ),
  // A paper takeaway bag with handles.
  takeOut: (
    <>
      <path d="M5 8.5h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z" />
      <path d="M9 11V6.5a3 3 0 0 1 6 0V11" />
    </>
  ),
  restart: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v4h4" />
    </>
  ),
  cash: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="1.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  history: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 4v3.5h3.5" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
  categories: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <path d="M14 17h6M17 14v6" />
    </>
  ),
};

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {SHAPES[name]}
    </svg>
  );
}
