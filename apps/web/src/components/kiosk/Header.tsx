"use client";

import { useCart } from "@/hooks/useCart";

// Ported from kiosk.html's <header> (Downloads/kiosk.html, lines 46-97, 366-382).
// Cart count/total now come from useCart() — wired in Sprint 2.
//
// Below sm (640px) the logo/name/search/cart-pill couldn't all fit on one row without
// clipping the search placeholder ("Search m"). Search now drops to its own full-width
// row below the logo/cart row on mobile; at sm and up it goes back to a single row.
// Kept slim (py-2.5) because height is the scarce dimension on the 1024x600 kiosk.
// The cart pill shows the item count and total at all times, even when empty.
interface HeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenCart: () => void;
}

export function Header({ searchQuery, onSearchChange, onOpenCart }: HeaderProps) {
  const { count, total } = useCart();

  return (
    <header className="flex flex-shrink-0 flex-col gap-2.5 bg-matcha-deep px-3 pt-3 pb-2.5 text-cream sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-2.5">
      <div className="flex items-center gap-2 sm:gap-3">
        <img
          src="/logo.jpg"
          alt="Zak's Sizzling Hub"
          className="h-8 w-8 flex-shrink-0 rounded-[50%_50%_50%_8px] object-cover sm:h-10 sm:w-10"
        />
        <div className="min-w-0">
          <div className="truncate text-[16px] leading-none font-semibold tracking-tight sm:text-[22px]">
            Zak&apos;s Sizzling Hub
          </div>
          <div className="-mt-0.5 hidden text-[11.5px] text-honey-soft sm:block">hot off the plate — order here</div>
        </div>

        <CartPill count={count} total={total} onOpenCart={onOpenCart} className="ml-auto sm:hidden" />
      </div>

      <SearchField searchQuery={searchQuery} onSearchChange={onSearchChange} className="sm:max-w-[520px] sm:flex-1" />

      <CartPill count={count} total={total} onOpenCart={onOpenCart} className="ml-auto hidden flex-shrink-0 sm:flex" />
    </header>
  );
}

function SearchField({
  searchQuery,
  onSearchChange,
  className = "",
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  className?: string;
}) {
  return (
    // A <label> so tapping anywhere on the pill (icon included) focuses the input, and the
    // input itself fills the pill's full 44px height rather than a 24px strip in the middle.
    <label
      className={`flex min-w-0 cursor-text items-center gap-2.5 rounded-full border border-white/18 bg-white/12 px-4 sm:px-5 ${className}`}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="flex-shrink-0 opacity-85"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        placeholder="Search menu..."
        autoComplete="off"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Search menu"
        className="min-h-12 w-full min-w-0 bg-transparent text-base text-cream outline-none placeholder:text-cream/70 sm:text-lg"
      />
    </label>
  );
}

function CartPill({
  count,
  total,
  onOpenCart,
  className = "",
}: {
  count: number;
  total: number;
  onOpenCart: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onOpenCart}
      aria-label={`View order: ${count} item${count !== 1 ? "s" : ""}, ₱${total.toFixed(2)}`}
      className={`flex min-h-12 flex-shrink-0 items-center gap-2 rounded-full bg-honey pr-4 pl-2 text-base font-bold text-matcha-deep shadow-card active:scale-96 sm:gap-3 sm:pr-5 sm:text-lg ${className}`}
    >
      <span className="flex h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-full bg-matcha-deep px-1.5 text-sm font-bold text-cream">
        {count}
      </span>
      <span className="whitespace-nowrap">₱{total.toFixed(2)}</span>
    </button>
  );
}
