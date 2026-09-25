"use client";

import type { Ref } from "react";
import type { Category, Product } from "@zaks/shared-types";
import { ProductRow } from "./ProductRow";

// The whole menu as one continuous, sectioned list (delivery-app style) instead of one
// category at a time: customers scroll through everything, and the category rail jumps
// between sections and highlights the one in view (see useScrollSpy).
//
// Rows: one column on phones and tablets, two from lg (the 1024px kiosk), three from xl.
// pb-28 keeps the last row clear of the floating basket bar.
export interface MenuSection {
  category: Category;
  products: Product[];
}

interface MenuListProps {
  ref?: Ref<HTMLElement>;
  sections: MenuSection[];
  searchQuery: string;
  onClearSearch: () => void;
  onOpenProduct: (id: string) => void;
  onQuickAdd: (product: Product) => void;
}

export function MenuList({ ref, sections, searchQuery, onClearSearch, onOpenProduct, onQuickAdd }: MenuListProps) {
  const itemCount = sections.reduce((sum, s) => sum + s.products.length, 0);

  return (
    <main ref={ref} className="relative min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-28 sm:px-6">
      <div className="flex items-baseline justify-between gap-3 pt-4 sm:pt-5">
        <h1 className="font-display min-w-0 text-2xl font-semibold break-words text-matcha-deep">
          {searchQuery ? "Search results" : "All items"}
        </h1>
        <span className="shrink-0 text-sm text-ink-soft">
          {itemCount} item{itemCount !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="mt-1 text-base text-ink-soft">
        {searchQuery ? `Results for "${searchQuery}"` : "Tap an item to see details and customize your order."}
      </p>

      {sections.length === 0 ? (
        <EmptyState searchQuery={searchQuery} onClearSearch={onClearSearch} />
      ) : (
        sections.map(({ category, products }) => (
          <section key={category.id} data-spy-id={category.id} aria-labelledby={`menu-section-${category.id}`}>
            {/* Sticky, so the name of the section being browsed stays in view. Solid
                background, no backdrop blur: blur is expensive on the kiosk's GPU. */}
            <h2
              id={`menu-section-${category.id}`}
              className="font-display sticky top-0 z-10 -mx-3 flex items-center gap-2 bg-cream px-3 pt-5 pb-2 text-xl font-semibold text-matcha-deep sm:-mx-6 sm:px-6 lg:text-2xl"
            >
              <span aria-hidden="true">{category.icon}</span>
              <span className="min-w-0 break-words">{category.name}</span>
              <span className="ml-auto font-sans text-sm font-normal text-ink-soft">{products.length}</span>
            </h2>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <ProductRow key={p.id} product={p} onOpen={() => onOpenProduct(p.id)} onQuickAdd={() => onQuickAdd(p)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

function EmptyState({ searchQuery, onClearSearch }: { searchQuery: string; onClearSearch: () => void }) {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <span aria-hidden="true" className="text-5xl">
        {searchQuery ? "🔍" : "🍽️"}
      </span>
      <p className="font-display mt-3 text-xl text-matcha-deep">
        {searchQuery ? "No dishes match your search" : "The menu is empty right now"}
      </p>
      <p className="mt-1 text-base text-ink-soft">
        {searchQuery ? "Try another word, or browse the categories." : "Please ask our staff for help."}
      </p>
      {searchQuery && (
        <button onClick={onClearSearch} className="mt-5 min-h-12 rounded-full bg-matcha px-6 text-base font-bold text-cream">
          Clear search
        </button>
      )}
    </div>
  );
}

/** Placeholder rows shown while the menu loads, shaped like the real rows so nothing jumps. */
export function MenuSkeleton() {
  return (
    <div className="min-w-0 flex-1 overflow-hidden px-3 pt-5 sm:px-6" aria-busy="true">
      <span role="status" className="sr-only">
        Loading menu…
      </span>
      <div className="h-7 w-40 animate-pulse rounded-lg bg-line" />
      <div className="mt-2 h-5 w-72 max-w-full animate-pulse rounded-lg bg-line/70" />
      <div className="mt-7 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-2xl bg-white p-3 shadow-card">
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-5 w-3/4 animate-pulse rounded bg-line" />
              <div className="h-4 w-full animate-pulse rounded bg-line/70" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-line/70" />
              <div className="mt-auto h-5 w-20 animate-pulse rounded bg-line" />
            </div>
            <div className="h-24 w-24 shrink-0 animate-pulse rounded-xl bg-line lg:h-28 lg:w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
