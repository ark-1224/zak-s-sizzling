"use client";

import type { Product } from "@zaks/shared-types";
import { ProductCard } from "./ProductCard";

// Ported from kiosk.html's main.catalog / .grid (Downloads/kiosk.html, lines 136-153,
// 386-393, 569-608). getFilteredProducts() becomes the useMemo in the parent page.
//
// 2 columns below 480px, 3 from 480px up (still-narrow phones/small tablets), 4 from md,
// then auto-fill from lg so wide desktop/kiosk screens use their extra width instead of
// just stretching 4 cards. pb-24 on mobile reserves room for the sticky MobileCartBar so
// the last row is never hidden behind it once the cart has items.
interface ProductGridProps {
  title: string;
  subtitle: string;
  products: Product[];
  onOpenProduct: (id: string) => void;
}

export function ProductGrid({ title, subtitle, products, onOpenProduct }: ProductGridProps) {
  return (
    <main className="flex-1 overflow-y-auto px-3 pt-4 pb-24 sm:px-7.5 sm:pt-6 sm:pb-10">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-display text-[22px] font-semibold text-matcha-deep sm:text-[26px]">{title}</h2>
        <span className="text-[13px] text-ink-soft">
          {products.length} item{products.length !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="mb-5 text-[13.5px] text-ink-soft">{subtitle}</p>

      {products.length === 0 ? (
        <div className="py-15 text-center text-ink-soft">
          <div className="font-display mb-1.5 text-xl text-matcha-deep">Nothing here yet</div>
          <div>Try a different category or search term.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onOpen={() => onOpenProduct(p.id)} />
          ))}
        </div>
      )}
    </main>
  );
}
