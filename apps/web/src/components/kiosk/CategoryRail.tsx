"use client";

import type { Category } from "@zaks/shared-types";

// Ported from kiosk.html's nav.cat-rail / .cat-item (Downloads/kiosk.html, lines 103-134,
// 527-546). renderCategories()'s manual DOM diff becomes a plain .map() render here.
//
// Always a vertical sidebar at every screen size — the target hardware is a 9" kiosk
// touchscreen (~1024x600), and the requirement is a consistent sidebar layout rather
// than reshaping into a horizontal strip on narrow screens. Width and text size scale
// down instead; long category names wrap onto a second line rather than truncating,
// since a vertical list has the room to absorb that.
interface CategoryRailProps {
  categories: Category[];
  activeCategory: number | "all";
  onSelect: (categoryId: number | "all") => void;
}

export function CategoryRail({ categories, activeCategory, onSelect }: CategoryRailProps) {
  return (
    <nav className="flex w-[100px] flex-shrink-0 flex-col overflow-y-auto border-r border-line bg-paper py-3 sm:w-[180px] sm:py-4 md:w-[186px] md:py-5.5">
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
      className={`flex w-full items-center gap-2 border-l-[3px] px-3 py-2.5 text-left text-[12px] leading-tight font-medium transition-colors sm:gap-2.5 sm:px-4.5 sm:py-3 sm:text-[13.5px] md:gap-3 md:px-5.5 md:py-3.5 md:text-[15px] ${
        active
          ? "border-matcha bg-gradient-to-r from-available/8 to-transparent font-bold text-matcha-deep"
          : "border-transparent text-ink-soft"
      }`}
    >
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-[50%_50%_50%_0] rotate-45 ${active ? "bg-matcha" : "bg-line"}`}
      />
      <span className="min-w-0 flex-1 truncate sm:overflow-visible sm:text-clip sm:whitespace-normal">{label}</span>
      {isNew && (
        <span className="flex-shrink-0 rounded-[5px] bg-berry px-1.5 py-0.5 text-[9.5px] font-bold text-white">
          NEW
        </span>
      )}
    </button>
  );
}
