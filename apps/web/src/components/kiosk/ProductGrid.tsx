"use client";

import type { Product } from "@zaks/shared-types";
import { ProductCard } from "./ProductCard";

// Ported from kiosk.html's main.catalog / .grid (Downloads/kiosk.html, lines 136-153,
// 386-393, 569-608). getFilteredProducts() becomes the useMemo in the parent page.
interface ProductGridProps {
  title: string;
  subtitle: string;
  products: Product[];
  onOpenProduct: (id: string) => void;
}

export function ProductGrid({ title, subtitle, products, onOpenProduct }: ProductGridProps) {
  return (
    <main className="flex-1 overflow-y-auto px-4 pt-5 pb-10 sm:px-7.5 sm:pt-6">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-display text-[26px] font-semibold text-matcha-deep">{title}</h2>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4.5">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onOpen={() => onOpenProduct(p.id)} />
          ))}
        </div>
      )}
    </main>
  );
}
