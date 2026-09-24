"use client";

import type { Category } from "@zaks/shared-types";

// Ported from kiosk.html's nav.cat-rail / .cat-item (Downloads/kiosk.html, lines 103-134,
// 527-546).
//
// Below md (768px) a vertical rail can't fit full category names next to the NEW badge
// without truncating ("Sizzling…", or worse "S." — the badge crowding the label off the
// end). Below that breakpoint this renders as a horizontally scrollable pill bar instead,
// so every label stays fully readable; the NEW badge becomes a small dot since a pill has
// no room for a second word. At md and up there's enough width for a real sidebar, so it
// reverts to the original vertical rail with the NEW text badge.
interface CategoryRailProps {
  categories: Category[];
  activeCategory: number | "all";
  onSelect: (categoryId: number | "all") => void;
}

export function CategoryRail({ categories, activeCategory, onSelect }: CategoryRailProps) {
  return (
    <>
      <nav
        className="flex w-full flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-paper px-3 py-2.5 md:hidden"
        aria-label="Categories"
      >
        <CategoryPill label="All items" active={activeCategory === "all"} onClick={() => onSelect("all")} />
        {categories.map((c) => (
          <CategoryPill
            key={c.id}
            label={c.name}
            active={activeCategory === c.id}
            isNew={c.isNew}
            onClick={() => onSelect(c.id)}
          />
        ))}
      </nav>

      <nav
        className="hidden w-[200px] flex-shrink-0 flex-col overflow-y-auto border-r border-line bg-paper py-5 md:flex lg:w-[220px]"
        aria-label="Categories"
      >
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
    </>
  );
}

function CategoryPill({
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
      className={`flex h-11 flex-shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold whitespace-nowrap transition-colors active:scale-97 ${
        active ? "border-matcha bg-matcha/10 text-matcha-deep" : "border-line bg-white text-ink-soft"
      }`}
    >
      {label}
      {isNew && (
        <>
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-berry" aria-hidden="true" />
          <span className="sr-only">New</span>
        </>
      )}
    </button>
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
      className={`flex min-h-11 w-full items-center gap-3 border-l-[3px] px-5.5 py-3.5 text-left text-[15px] leading-tight font-medium transition-colors ${
        active
          ? "border-matcha bg-gradient-to-r from-available/8 to-transparent font-bold text-matcha-deep"
          : "border-transparent text-ink-soft"
      }`}
    >
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-[50%_50%_50%_0] rotate-45 ${active ? "bg-matcha" : "bg-line"}`}
      />
      <span className="min-w-0 flex-1">{label}</span>
      {isNew && (
        <span className="flex-shrink-0 rounded-[5px] bg-berry px-1.5 py-0.5 text-[9.5px] font-bold text-white">
          NEW
        </span>
      )}
    </button>
  );
}
