"use client";

import type { Product } from "@zaks/shared-types";
import { categoryBgColor } from "@/lib/categoryColors";

// Ported from kiosk.html's .card (Downloads/kiosk.html, lines 155-193, 589-608).
// The SOLD OUT ribbon is driven by product.isAvailable, which Sprint 4's
// `inventory:updated` WebSocket handler will flip live (replacing the old
// refreshInventory() stub).
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
        className="relative flex h-[118px] items-center justify-center text-[44px]"
        style={{ background: categoryBgColor(product.category?.name) }}
      >
        {product.icon}
        {out && (
          <div className="absolute top-2.5 -left-8 -rotate-38 bg-grey-out px-8.5 py-0.75 text-[10.5px] font-bold text-white shadow">
            SOLD OUT
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-3.5 pt-3 pb-3.5">
        <div className={`text-[15.5px] leading-tight font-semibold ${out ? "opacity-50" : ""}`}>{product.name}</div>
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <span className={`text-[15px] font-bold text-honey ${out ? "opacity-50" : ""}`}>
            ₱{product.price.toFixed(2)}
          </span>
          <span className={`flex items-center gap-1 text-[11px] font-semibold ${out ? "text-grey-out" : "text-available"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${out ? "bg-grey-out" : "bg-available"}`} />
            {out ? "Unavailable" : "In stock"}
          </span>
        </div>
      </div>
    </button>
  );
}
