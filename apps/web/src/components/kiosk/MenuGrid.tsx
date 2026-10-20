"use client";

import type { Ref } from "react";
import type { Product } from "@zaks/shared-types";
import { PRICE_RANGES, type PriceRangeId } from "@/lib/priceRanges";
import { Icon } from "@/components/Icon";
import { ItemTile } from "./ItemTile";

// The kiosk's work surface: one category's dishes (or the search results) as a grid of
// tiles under its name and the price chips (Figure 2.2's price filtering). Two columns on
// a phone, three on a tablet, four on the 1024px kiosk. The grid scrolls on its own; the
// frame (top bar, rail, order bar) never moves.
interface MenuGridProps {
  ref?: Ref<HTMLElement>;
  title: string;
  /** Under the title while searching, e.g. which words were searched for. */
  subtitle?: string;
  products: Product[];
  priceRange: PriceRangeId;
  /** How many dishes each price range would show here. */
  priceCounts: Record<PriceRangeId, number>;
  onPriceRangeChange: (id: PriceRangeId) => void;
  searchQuery: string;
  onClearSearch: () => void;
  onOpenProduct: (id: string) => void;
  onQuickAdd: (product: Product) => void;
}

export function MenuGrid({
  ref,
  title,
  subtitle,
  products,
  priceRange,
  priceCounts,
  onPriceRangeChange,
  searchQuery,
  onClearSearch,
  onOpenProduct,
  onQuickAdd,
}: MenuGridProps) {
  return (
    <main ref={ref} className="kiosk-scroll relative min-w-0 flex-1 overflow-y-auto overscroll-contain bg-paper px-3 pb-6 sm:px-5">
      <div className="flex flex-col gap-2.5 pt-3.5 pb-3.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 className="font-display text-3xl leading-tight font-extrabold tracking-[-0.02em] break-words text-matcha-deep">
            {title}
          </h1>
          <p className="text-base text-ink-soft">{subtitle ?? `${products.length} dish${products.length === 1 ? "" : "es"}`}</p>
        </div>
        <PriceChips value={priceRange} counts={priceCounts} onChange={onPriceRangeChange} />
      </div>

      {products.length === 0 ? (
        <EmptyGrid
          searchQuery={searchQuery}
          rangeLabel={priceRange === "any" ? null : PRICE_RANGES.find((r) => r.id === priceRange)?.label ?? null}
          onClearSearch={onClearSearch}
          onShowAllPrices={() => onPriceRangeChange("any")}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ItemTile key={p.id} product={p} onOpen={() => onOpenProduct(p.id)} onQuickAdd={() => onQuickAdd(p)} />
          ))}
        </ul>
      )}
    </main>
  );
}

// One row that scrolls sideways on narrow screens instead of wrapping, to save height.
function PriceChips({
  value,
  counts,
  onChange,
}: {
  value: PriceRangeId;
  counts: Record<PriceRangeId, number>;
  onChange: (id: PriceRangeId) => void;
}) {
  return (
    <div role="group" aria-label="Filter by price" className="-mx-3 flex shrink-0 gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:-mx-5 sm:px-5">
      {PRICE_RANGES.map((range) => {
        const selected = value === range.id;
        return (
          <button
            key={range.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(range.id)}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-base font-semibold whitespace-nowrap transition-colors ${
              selected ? "border-char bg-char text-cream" : "border-line bg-white text-ink"
            }`}
          >
            {range.label}
            <span className={`text-sm font-normal ${selected ? "text-honey" : "text-ink-soft"}`}>{counts[range.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmptyGrid({
  searchQuery,
  rangeLabel,
  onClearSearch,
  onShowAllPrices,
}: {
  searchQuery: string;
  rangeLabel: string | null;
  onClearSearch: () => void;
  onShowAllPrices: () => void;
}) {
  const headline = searchQuery
    ? `Nothing matches “${searchQuery}”`
    : rangeLabel
      ? `No dishes here ${rangeLabel.toLowerCase()}`
      : "Nothing here right now";
  const detail = searchQuery
    ? rangeLabel
      ? `Try another word, or show every price.`
      : "Try another word, or pick a category on the left."
    : rangeLabel
      ? "Try another price, or another category."
      : "Please pick another category, or ask our staff.";

  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-honey-soft text-matcha">
        <Icon name="search" className="h-8 w-8" />
      </span>
      <p className="font-display mt-4 text-2xl font-bold break-words text-matcha-deep">{headline}</p>
      <p className="mt-1 text-base text-ink-soft">{detail}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {rangeLabel && (
          <button type="button" onClick={onShowAllPrices} className="min-h-12 rounded-full bg-matcha px-6 text-base font-bold text-cream">
            Show every price
          </button>
        )}
        {searchQuery && (
          <button
            type="button"
            onClick={onClearSearch}
            className={`min-h-12 rounded-full px-6 text-base font-bold ${rangeLabel ? "border-2 border-matcha text-matcha" : "bg-matcha text-cream"}`}
          >
            Clear search
          </button>
        )}
      </div>
    </div>
  );
}

/** Placeholder shapes while the menu loads, so nothing jumps. */
export function MenuGridSkeleton() {
  return (
    <div className="min-w-0 flex-1 overflow-hidden bg-paper px-3 pt-4 sm:px-5" aria-busy="true">
      <span role="status" className="sr-only">
        Loading menu…
      </span>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-line" />
      <div className="mt-2 h-5 w-24 animate-pulse rounded-lg bg-line/70" />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-[18px] bg-white shadow-card">
            <div className="aspect-[4/3] animate-pulse bg-line" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
              <div className="h-5 w-16 animate-pulse rounded bg-line" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
