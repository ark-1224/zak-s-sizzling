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
    <nav className="w-[186px] flex-shrink-0 overflow-y-auto border-r border-line bg-paper py-5.5">
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
      className={`flex w-full items-center gap-3 border-l-[3px] px-5.5 py-3.5 text-left text-[15px] font-medium transition-colors ${
        active
          ? "border-matcha bg-gradient-to-r from-available/8 to-transparent font-bold text-matcha-deep"
          : "border-transparent text-ink-soft"
      }`}
    >
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-[50%_50%_50%_0] rotate-45 ${active ? "bg-matcha" : "bg-line"}`}
      />
      {label}
      {isNew && (
        <span className="ml-auto rounded-[5px] bg-berry px-1.5 py-0.5 text-[9.5px] font-bold text-white">NEW</span>
      )}
    </button>
  );
}
