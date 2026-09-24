"use client";

import { useCart } from "@/hooks/useCart";

// Mobile-only sticky bar that surfaces the cart once it has items, so a customer doesn't
// have to remember the header cart pill exists once they've scrolled past it. Only
// rendered below sm — the header cart pill covers this at sm and up. Padded for
// safe-area-inset-bottom so it clears the home-indicator area on notched phones;
// ProductGrid's pb-24 keeps the last product row from ever sitting underneath it.
interface MobileCartBarProps {
  onOpenCart: () => void;
}

export function MobileCartBar({ onOpenCart }: MobileCartBarProps) {
  const { count, total } = useCart();

  if (count === 0) return null;

  return (
    <button
      onClick={onOpenCart}
      className="fixed inset-x-0 bottom-0 z-30 flex min-h-14 items-center justify-between gap-3 bg-matcha-deep px-4 pt-3 text-cream shadow-[0_-6px_20px_-10px_rgba(0,0,0,0.45)] active:bg-matcha-deep/95 sm:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <span className="flex items-center gap-2.5 text-[14px] font-semibold">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-honey text-[12px] font-bold text-matcha-deep">
          {count}
        </span>
        View cart
      </span>
      <span className="text-[15px] font-bold">₱{total.toFixed(2)}</span>
    </button>
  );
}
