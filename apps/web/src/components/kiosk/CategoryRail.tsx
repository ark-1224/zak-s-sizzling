"use client";

import type { Category } from "@zaks/shared-types";

// Ported from kiosk.html's nav.cat-rail / .cat-item (Downloads/kiosk.html, lines 103-134,
// 527-546). renderCategories()'s manual DOM diff becomes a plain .map() render here.
interface CategoryRailProps {
  categories: Category[];
  activeCategory: number | "all";
  onSelect: (categoryId: number | "all") => void;
}

export function CategoryRail({ categories, activeCategory, onSelect }: CategoryRailProps) {
  return (
    <nav className="flex flex-shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-paper px-3 py-2.5 md:w-[186px] md:flex-col md:gap-0 md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:px-0 md:py-5.5">
      <CategoryItem label="All items" active={activeCategory === "all"} onClick={() => onSelect("all")} />
      {categories.map((c) => (
        <CategoryItem
          key={c.id}
          label={c.name}
          active={activeCategory === c.id}
          isNew={c.isNew}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </nav>
  );
}

function CategoryItem({
  label,
  active,
  isNew,
  onClick,
}: {
  label: string;
  active: boolean;
  isNew?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors md:w-full md:flex-shrink md:gap-3 md:rounded-none md:border-t-0 md:border-r-0 md:border-b-0 md:border-l-[3px] md:px-5.5 md:py-3.5 md:text-left md:text-[15px] ${
        active
          ? "border-matcha bg-available/15 font-bold text-matcha-deep md:bg-gradient-to-r md:from-available/8 md:to-transparent"
          : "border-line text-ink-soft md:border-transparent"
      }`}
    >
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-[50%_50%_50%_0] rotate-45 ${active ? "bg-matcha" : "bg-line"}`}
      />
      {label}
      {isNew && (
        <span className="rounded-[5px] bg-berry px-1.5 py-0.5 text-[9.5px] font-bold text-white md:ml-auto">
          NEW
        </span>
      )}
    </button>
  );
}
