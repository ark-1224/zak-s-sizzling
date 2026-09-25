"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@zaks/shared-types";
import { categoryBgColor } from "@/lib/categoryColors";
import { Icon } from "@/components/Icon";

// One menu item as a delivery-app style row: name, two-line description and price on
// the left, a square thumbnail on the right, and a round "+" that adds one straight to
// the order. Tapping anywhere else on the row opens the item sheet for quantity and
// special instructions. Sold-out state follows product.isAvailable, which the
// `inventory:updated` WebSocket event flips live.
//
// The thumbnail box is the photo slot. Products have no image field yet, so it shows the
// item's emoji on its category colour; once photos exist, an
// <img className="h-full w-full object-cover" /> goes inside the same box and nothing
// else about the row changes.
interface ProductRowProps {
  product: Product;
  onOpen: () => void;
  onQuickAdd: () => void;
}

const ADDED_FEEDBACK_MS = 900;

export function ProductRow({ product, onOpen, onQuickAdd }: ProductRowProps) {
  const out = !product.isAvailable;
  const [justAdded, setJustAdded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleQuickAdd() {
    onQuickAdd();
    setJustAdded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
  }

  return (
    // The "+" is a sibling of the row button, not nested inside it: a button inside a
    // button is invalid HTML and makes the inner tap ambiguous.
    <li className="relative">
      <button
        onClick={onOpen}
        disabled={out}
        className={`flex h-full w-full items-stretch gap-3 rounded-2xl bg-white p-3 text-left shadow-card transition-transform active:scale-98 disabled:active:scale-100 ${
          out ? "opacity-60" : ""
        }`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 text-base leading-snug font-semibold text-ink lg:text-lg">{product.name}</span>
          {product.description && (
            <span className="mt-1 line-clamp-2 text-base leading-snug text-ink-soft">{product.description}</span>
          )}
          <span className="mt-auto flex items-center gap-2 pt-2">
            <span className="text-base font-bold text-price-accent lg:text-lg">₱{product.price.toFixed(2)}</span>
            {out && <span className="text-sm font-semibold text-ink-soft">Unavailable</span>}
          </span>
        </span>

        <span
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl lg:h-28 lg:w-28"
          style={{ background: categoryBgColor(product.category?.name) }}
        >
          <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-4xl lg:text-5xl">
            {product.icon}
          </span>
          {out && (
            <span className="absolute inset-x-1.5 top-1.5 rounded-full bg-ink-soft/95 py-0.5 text-center text-xs font-bold text-cream">
              Sold out
            </span>
          )}
        </span>
      </button>

      {!out && (
        <button
          onClick={handleQuickAdd}
          aria-label={`Add one ${product.name} to your order`}
          className={`absolute right-1.5 bottom-1.5 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white text-cream shadow-card transition-transform active:scale-90 ${
            justAdded ? "bg-available" : "bg-matcha"
          }`}
        >
          <Icon name={justAdded ? "check" : "plus"} className="h-6 w-6" />
        </button>
      )}
    </li>
  );
}
