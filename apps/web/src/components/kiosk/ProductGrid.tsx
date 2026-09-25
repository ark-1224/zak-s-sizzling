"use client";

import type { Product } from "@zaks/shared-types";
import { ProductCard } from "./ProductCard";

// Ported from kiosk.html's main.catalog / .grid (Downloads/kiosk.html, lines 136-153,
// 386-393, 569-608). getFilteredProducts() becomes the useMemo in the parent page.
//
// 2 columns on phones, 3 from 480px (the category rail takes 64-224px of the width at
// these sizes, so 4 fixed columns at md squeezed the cards until price/stock collided),
// then auto-fill from lg so wide screens add columns instead of stretching cards.
// pb-24 on mobile reserves room for the sticky MobileCartBar so the last row is never
// hidden behind it.
interface ProductGridProps {
  title: string;
  titleIcon?: string;
  subtitle: string;
  products: Product[];
  onOpenProduct: (id: string) => void;
}

export function ProductGrid({ title, titleIcon, subtitle, products, onOpenProduct }: ProductGridProps) {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-3 pt-4 pb-24 sm:px-7.5 sm:pt-6 sm:pb-10">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="font-display min-w-0 text-[22px] font-semibold break-words text-matcha-deep sm:text-[26px]">
          {titleIcon && (
            <span aria-hidden="true" className="mr-2">
              {titleIcon}
            </span>
          )}
          {title}
        </h2>
        <span className="shrink-0 text-sm text-ink-soft">
          {products.length} item{products.length !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="mb-5 text-base text-ink-soft sm:text-sm">{subtitle}</p>

      {products.length === 0 ? (
        <div className="py-15 text-center text-ink-soft">
          <div className="font-display mb-1.5 text-xl text-matcha-deep">Nothing here yet</div>
          <div>Try a different category or search term.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onOpen={() => onOpenProduct(p.id)} />
          ))}
        </div>
      )}
    </main>
  );
}
