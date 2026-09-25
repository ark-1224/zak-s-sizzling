"use client";

import { useCart } from "@/hooks/useCart";
import { Icon } from "@/components/Icon";

// Floating "View order" bar (delivery-app style) shown at every screen size once the
// cart has items: item count, total and a one-tap way into the basket, without the
// customer having to find the header pill. Padded for safe-area-inset-bottom so it
// clears the home indicator on notched phones; MenuList's bottom padding keeps the
// last menu row from ever sitting underneath it.
interface BasketBarProps {
  onOpenCart: () => void;
}

export function BasketBar({ onOpenCart }: BasketBarProps) {
  const { count, total } = useCart();

  if (count === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <button
        onClick={onOpenCart}
        className="animate-sheet-up pointer-events-auto flex min-h-14 w-full max-w-xl items-center gap-3 rounded-full bg-matcha-deep py-2 pr-4 pl-2 text-cream shadow-2xl transition-transform active:scale-98 motion-reduce:animate-none"
      >
        <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-honey px-2 text-base font-bold text-matcha-deep">
          {count}
        </span>
        <span className="text-base font-semibold lg:text-lg">View order</span>
        <span className="ml-auto text-lg font-bold">₱{total.toFixed(2)}</span>
        <Icon name="chevronRight" className="h-5 w-5" />
      </button>
    </div>
  );
}
