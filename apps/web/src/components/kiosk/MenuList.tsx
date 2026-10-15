"use client";

import type { Ref } from "react";
import type { Category, Product } from "@zaks/shared-types";
import { ProductRow } from "./ProductRow";
import { PRICE_RANGES, type PriceRangeId } from "@/lib/priceRanges";

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
  priceRange: PriceRangeId;
  /** How many items (matching the search) each price range has. */
  priceCounts: Record<PriceRangeId, number>;
  onPriceRangeChange: (id: PriceRangeId) => void;
  onOpenProduct: (id: string) => void;
  onQuickAdd: (product: Product) => void;
}

export function MenuList({
  ref,
  sections,
  searchQuery,
  onClearSearch,
  priceRange,
  priceCounts,
  onPriceRangeChange,
  onOpenProduct,
  onQuickAdd,
}: MenuListProps) {
  const itemCount = sections.reduce((sum, s) => sum + s.products.length, 0);
  const rangeLabel = priceRange === "any" ? null : PRICE_RANGES.find((r) => r.id === priceRange)?.label;

  return (
    <main ref={ref} className="relative min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-28 sm:px-6">
      <div className="flex items-baseline justify-between gap-3 pt-4 sm:pt-5">
        <h1 className="font-display min-w-0 text-2xl font-semibold break-words text-matcha-deep">
          {searchQuery ? "Search results" : rangeLabel ?? "All items"}
        </h1>
        <span className="shrink-0 text-sm text-ink-soft">
          {itemCount} item{itemCount !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="mt-1 text-base text-ink-soft">
        {searchQuery
          ? `Results for "${searchQuery}"${rangeLabel ? `, ${rangeLabel.toLowerCase()}` : ""}`
          : "Tap an item to see details and customize your order."}
      </p>

      <PriceFilter value={priceRange} counts={priceCounts} onChange={onPriceRangeChange} />

      {sections.length === 0 ? (
        <EmptyState
          searchQuery={searchQuery}
          onClearSearch={onClearSearch}
          rangeLabel={rangeLabel ?? null}
          onShowAllPrices={() => onPriceRangeChange("any")}
        />
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

// Price chips (Figure 2.2's price filtering). One row that scrolls sideways on narrow
// screens rather than wrapping, to save height on the 600px-tall kiosk. Each chip shows
// how many items it would show, so a customer never taps into an empty list unawares.
function PriceFilter({
  value,
  counts,
  onChange,
}: {
  value: PriceRangeId;
  counts: Record<PriceRangeId, number>;
  onChange: (id: PriceRangeId) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by price"
      className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6"
    >
      {PRICE_RANGES.map((range) => {
        const selected = value === range.id;
        return (
          <button
            key={range.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(range.id)}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-base font-semibold whitespace-nowrap transition-colors ${
              selected ? "border-matcha bg-matcha text-cream" : "border-line bg-white text-ink"
            }`}
          >
            {range.label}
            <span className={`text-sm font-normal ${selected ? "text-cream/85" : "text-ink-soft"}`}>{counts[range.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({
  searchQuery,
  onClearSearch,
  rangeLabel,
  onShowAllPrices,
}: {
  searchQuery: string;
  onClearSearch: () => void;
  rangeLabel: string | null;
  onShowAllPrices: () => void;
}) {
  const filtered = Boolean(searchQuery || rangeLabel);
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <span aria-hidden="true" className="text-5xl">
        {filtered ? "🔍" : "🍽️"}
      </span>
      <p className="font-display mt-3 text-xl text-matcha-deep">
        {searchQuery ? "No dishes match your search" : rangeLabel ? `No dishes ${rangeLabel.toLowerCase()}` : "The menu is empty right now"}
      </p>
      <p className="mt-1 text-base text-ink-soft">
        {searchQuery && rangeLabel
          ? `Nothing ${rangeLabel.toLowerCase()} matches. Try another price, or another word.`
          : searchQuery
            ? "Try another word, or browse the categories."
            : rangeLabel
              ? "Try another price range."
              : "Please ask our staff for help."}
      </p>
      {filtered && (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {rangeLabel && (
            <button onClick={onShowAllPrices} className="min-h-12 rounded-full bg-matcha px-6 text-base font-bold text-cream">
              Show all prices
            </button>
          )}
          {searchQuery && (
            <button
              onClick={onClearSearch}
              className={`min-h-12 rounded-full px-6 text-base font-bold ${rangeLabel ? "border-2 border-matcha text-matcha" : "bg-matcha text-cream"}`}
            >
              Clear search
            </button>
          )}
        </div>
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
