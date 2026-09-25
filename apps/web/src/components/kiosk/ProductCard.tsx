"use client";

import type { Product } from "@zaks/shared-types";
import { categoryBgColor } from "@/lib/categoryColors";

// Ported from kiosk.html's .card (Downloads/kiosk.html, lines 155-193, 589-608).
// The SOLD OUT state is driven by product.isAvailable, which the `inventory:updated`
// WebSocket handler flips live.
//
// The image slot is a fixed 4:3 box so every card in a row is the same height even when
// products don't (yet) have a real photo — there's no imageUrl on the Product DTO today,
// so this always renders the icon/color fallback, but it's built to drop a real <img>
// (object-fit: cover) into the same box once product photos exist.
interface ProductCardProps {
  product: Product;
  onOpen: () => void;
}

export function ProductCard({ product, onOpen }: ProductCardProps) {
  const out = !product.isAvailable;

  return (
    <button
      onClick={onOpen}
      disabled={out}
      aria-disabled={out}
      className={`flex h-full flex-col overflow-hidden rounded-card bg-white text-left shadow-card transition-transform active:scale-97 disabled:active:scale-100 ${
        out ? "grayscale-[35%] opacity-60" : ""
      }`}
    >
      <div
        className="relative aspect-[4/3] w-full flex-shrink-0"
        style={{ background: categoryBgColor(product.category?.name) }}
      >
        <span className="flex h-full w-full items-center justify-center text-[32px] sm:text-[44px]">
          {product.icon}
        </span>
        {out && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-ink-soft/95 px-2.25 py-1 text-xs font-bold text-cream shadow sm:top-2 sm:left-2">
            Sold out
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 pt-2 pb-2.5 sm:gap-1.5 sm:px-3.5 sm:pt-3 sm:pb-3.5">
        <div className="line-clamp-2 min-h-[2.3em] text-base leading-tight font-semibold break-words">
          {product.name}
        </div>
        {/* Stacked until lg: below that the cards are too narrow for price + stock status on one line. */}
        <div className="mt-auto flex flex-col items-start gap-0.5 pt-0.5 lg:flex-row lg:items-center lg:justify-between lg:gap-2">
          <span className="text-base font-bold text-price-accent">₱{product.price.toFixed(2)}</span>
          <span
            className={`flex flex-shrink-0 items-center gap-1 text-xs font-semibold ${out ? "text-ink-soft" : "text-available"}`}
          >
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${out ? "bg-ink-soft" : "bg-available"}`} />
            {out ? "Unavailable" : "In stock"}
          </span>
        </div>
      </div>
    </button>
  );
}
