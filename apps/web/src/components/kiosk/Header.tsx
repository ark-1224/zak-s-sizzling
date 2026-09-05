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
    <header className="flex flex-shrink-0 items-center gap-6 bg-matcha-deep px-7 py-4.5 text-cream">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[50%_50%_50%_8px] bg-honey text-xl">
          🔥
        </div>
        <div>
          <div className="text-[22px] leading-none font-semibold tracking-tight">Zak&apos;s Sizzling Hub</div>
          <div className="-mt-0.5 text-[11.5px] text-honey-soft">hot off the plate — order here</div>
        </div>
      </div>

      <div className="flex max-w-[520px] flex-1 items-center gap-2.5 rounded-full border border-white/18 bg-white/12 px-5 py-2.5">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 opacity-85">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search sizzling plates, rice, sides..."
          autoComplete="off"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-transparent text-[15px] text-cream outline-none placeholder:text-cream/55"
        />
      </div>

      <button
        onClick={onOpenCart}
        className="ml-auto flex items-center gap-3 rounded-full bg-honey py-2.5 pr-5 pl-4 text-[15px] font-semibold text-matcha-deep shadow-card active:scale-96"
      >
        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-matcha-deep text-xs font-bold text-cream">
          {count}
        </span>
        <span>₱{total.toFixed(2)}</span>
      </button>
    </header>
  );
}
