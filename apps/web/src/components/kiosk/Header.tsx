"use client";

import { useCart } from "@/hooks/useCart";

// Ported from kiosk.html's <header> (Downloads/kiosk.html, lines 46-97, 366-382).
// Cart count/total now come from useCart() — wired in Sprint 2.
//
// Below sm (640px) the logo/name/search/cart-pill couldn't all fit on one row without
// clipping the search placeholder ("Search m"). Search now drops to its own full-width
// row below the logo/cart row on mobile; at sm and up it goes back to a single row.
interface HeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenCart: () => void;
}

export function Header({ searchQuery, onSearchChange, onOpenCart }: HeaderProps) {
  const { count, total } = useCart();

  return (
    <header className="flex flex-shrink-0 flex-col gap-2.5 bg-matcha-deep px-3 pt-3 pb-2.5 text-cream sm:flex-row sm:items-center sm:gap-6 sm:px-7 sm:py-4.5">
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
        className="min-h-11 w-full min-w-0 bg-transparent text-base text-cream outline-none placeholder:text-cream/70 sm:text-[15px]"
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
      className={`flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-full bg-honey py-2 pr-3 pl-2.5 text-[13px] font-semibold text-matcha-deep shadow-card active:scale-96 sm:gap-3 sm:py-2.5 sm:pr-5 sm:pl-4 sm:text-[15px] ${className}`}
    >
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-matcha-deep text-[11px] font-bold text-cream sm:h-5.5 sm:w-5.5 sm:text-xs">
        {count}
      </span>
      <span className="whitespace-nowrap">₱{total.toFixed(2)}</span>
    </button>
  );
}
