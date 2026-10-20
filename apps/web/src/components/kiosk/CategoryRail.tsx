"use client";

import type { Category } from "@zaks/shared-types";
import { categoryBgColor } from "@/lib/categoryColors";

// The left side of the kiosk's char frame: one picture tile per category, like an
// in-store burger kiosk. Tapping a tile shows that category's dishes; the chosen one is a
// honey slab. While searching, no tile is chosen (the results span every category), and
// categories the price filter leaves empty are dimmed and can't be tapped.
//
// The rail stays visible at every width (an adviser/panel requirement): below md each
// tile is its picture over its name, from md up the picture sits beside the name.
const FALLBACK_ICON = "🍽️";

interface CategoryRailProps {
  categories: Category[];
  activeCategoryId: number | null;
  disabledIds: Set<number>;
  onSelect: (categoryId: number) => void;
}

export function CategoryRail({ categories, activeCategoryId, disabledIds, onSelect }: CategoryRailProps) {
  return (
    <nav
      aria-label="Menu categories"
      className="kiosk-no-scrollbar flex w-[84px] shrink-0 flex-col gap-1.5 overflow-y-auto border-r-2 border-honey/50 bg-char px-1.5 py-2.5 md:w-48 md:px-2.5 lg:w-52"
    >
      {categories.map((category) => {
        const active = category.id === activeCategoryId;
        const disabled = disabledIds.has(category.id);
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            disabled={disabled}
            aria-current={active ? "true" : undefined}
            className={`relative flex min-h-14 w-full shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 transition-colors disabled:opacity-35 md:flex-row md:justify-start md:gap-3 md:px-2 ${
              active ? "bg-honey text-char" : "text-cream/85 active:bg-char-soft"
            }`}
          >
            <span
              aria-hidden="true"
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-2xl shadow-[0_4px_10px_-4px_rgba(0,0,0,0.6)]"
              style={{ background: categoryBgColor(category.name) }}
            >
              {category.icon ?? FALLBACK_ICON}
            </span>
            <span className="line-clamp-2 w-full text-center text-[13px] leading-tight font-semibold [overflow-wrap:anywhere] md:w-auto md:min-w-0 md:flex-1 md:text-left md:text-base md:[overflow-wrap:normal]">
              {category.name}
            </span>
            {/* NEW sits on the tile's corner, so it never takes room from the name. */}
            {category.isNew && (
              <span
                className={`absolute top-1 right-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                  active ? "bg-char text-honey" : "bg-matcha text-cream"
                }`}
              >
                NEW
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
