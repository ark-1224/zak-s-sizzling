"use client";

import type { Product } from "@zaks/shared-types";
import { categoryBgColor } from "@/lib/categoryColors";

// Ported from kiosk.html's .card (Downloads/kiosk.html, lines 155-193, 589-608).
// The SOLD OUT ribbon is driven by product.isAvailable, which Sprint 4's
// `inventory:updated` WebSocket handler will flip live (replacing the old
// refreshInventory() stub).
//
// Always a 3-column grid, including on real phones (~80px/card) — content here scales
// down accordingly, and price/stock-status stack vertically below sm instead of
// competing for the same line, since there's no room for both side by side that small.
interface ProductCardProps {
  product: Product;
  onOpen: () => void;
}

export function ProductCard({ product, onOpen }: ProductCardProps) {
  const out = !product.isAvailable;

  return (
    <button
      onClick={onOpen}
      className={`flex flex-col overflow-hidden rounded-card bg-white text-left shadow-card transition-transform active:scale-97 ${
        out ? "opacity-90" : ""
      }`}
    >
      <div
        className="relative flex h-[64px] items-center justify-center text-[24px] sm:h-[118px] sm:text-[44px]"
        style={{ background: categoryBgColor(product.category?.name) }}
      >
        {product.icon}
        {out && (
          <div className="absolute top-1 -left-5 -rotate-38 bg-grey-out px-4.5 py-0.5 text-[7px] font-bold text-white shadow sm:top-2.5 sm:-left-8 sm:px-8.5 sm:py-0.75 sm:text-[10.5px]">
            SOLD OUT
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-1.5 pt-1.5 pb-2 sm:gap-1 sm:px-3.5 sm:pt-3 sm:pb-3.5">
        <div className={`text-[10px] leading-tight font-semibold sm:text-[15.5px] ${out ? "opacity-50" : ""}`}>
          {product.name}
        </div>
        <div className="mt-auto flex flex-col gap-0.5 pt-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:pt-1.5">
          <span className={`text-[10.5px] font-bold text-honey sm:text-[15px] ${out ? "opacity-50" : ""}`}>
            ₱{product.price.toFixed(2)}
          </span>
          <span
            className={`flex items-center gap-1 text-[8px] font-semibold sm:text-[11px] ${out ? "text-grey-out" : "text-available"}`}
          >
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${out ? "bg-grey-out" : "bg-available"}`} />
            {out ? "Unavailable" : "In stock"}
          </span>
        </div>
      </div>
    </button>
  );
}
