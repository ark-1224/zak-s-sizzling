"use client";

import { useCart } from "@/hooks/useCart";

// Ported from kiosk.html's <header> (Downloads/kiosk.html, lines 46-97, 366-382).
// Cart count/total now come from useCart() — wired in Sprint 2.
interface HeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenCart: () => void;
}

export function Header({ searchQuery, onSearchChange, onOpenCart }: HeaderProps) {
  const { count, total } = useCart();

  return (
    <header className="flex flex-shrink-0 items-center gap-2 bg-matcha-deep px-3 py-3 text-cream sm:gap-6 sm:px-7 sm:py-4.5">
      <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[50%_50%_50%_8px] bg-honey text-lg sm:h-10 sm:w-10 sm:text-xl">
          🔥
        </div>
        <div className="min-w-0">
          <div className="truncate text-[16px] leading-none font-semibold tracking-tight sm:text-[22px]">
            Zak&apos;s Sizzling Hub
          </div>
          <div className="-mt-0.5 hidden text-[11.5px] text-honey-soft sm:block">hot off the plate — order here</div>
        </div>
      </div>

      <div className="flex min-w-0 max-w-[520px] flex-1 items-center gap-2 rounded-full border border-white/18 bg-white/12 px-3 py-2 sm:gap-2.5 sm:px-5 sm:py-2.5">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
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
          className="w-full min-w-0 bg-transparent text-[14px] text-cream outline-none placeholder:text-cream/55 sm:text-[15px]"
        />
      </div>

      <button
        onClick={onOpenCart}
        className="ml-auto flex flex-shrink-0 items-center gap-1.5 rounded-full bg-honey py-2 pr-3 pl-2.5 text-[13px] font-semibold text-matcha-deep shadow-card active:scale-96 sm:gap-3 sm:py-2.5 sm:pr-5 sm:pl-4 sm:text-[15px]"
      >
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-matcha-deep text-[11px] font-bold text-cream sm:h-5.5 sm:w-5.5 sm:text-xs">
          {count}
        </span>
        <span className="whitespace-nowrap">₱{total.toFixed(2)}</span>
      </button>
    </header>
  );
}
