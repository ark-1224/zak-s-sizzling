"use client";

import type { Category } from "@zaks/shared-types";

// Ported from kiosk.html's nav.cat-rail / .cat-item (Downloads/kiosk.html, lines 103-134,
// 527-546).
//
// The rail navigates one continuous menu (MenuList): tapping a category scrolls to its
// section, and the highlight follows whichever section is in view. Categories with no
// matching items (e.g. during a search) are dimmed and can't be tapped.
//
// The sidebar stays visible at every width (an adviser/panel requirement). Below md it's
// a 64px rail with each category's emoji over its name, in up to two lines (UI review
// #25); from md up, emoji and name side by side. With the names always on screen, the
// rail no longer needs the button that opened them in an overlay.
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
      className="flex w-16 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-paper px-1 pt-3 pb-24 md:w-52 md:gap-0 md:px-0 md:pt-4 lg:w-56"
    >
      {categories.map((c) => (
        <CategoryItem
          key={c.id}
          label={c.name}
          icon={c.icon ?? FALLBACK_ICON}
          isNew={c.isNew}
          active={activeCategoryId === c.id}
          disabled={disabledIds.has(c.id)}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </nav>
  );
}

function CategoryItem({
  label,
  icon,
  isNew,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  isNew: boolean;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={isNew ? `${label} (new)` : label}
      aria-current={active ? "true" : undefined}
      title={label}
      className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-2 text-base leading-tight font-medium transition-colors disabled:opacity-35 md:flex-row md:justify-start md:gap-3 md:rounded-none md:border-l-4 md:px-4 md:py-3 md:text-left lg:px-5 lg:text-lg ${
        active
          ? "bg-matcha/15 font-bold text-matcha-deep md:border-matcha md:bg-transparent md:bg-gradient-to-r md:from-matcha/12 md:to-transparent"
          : "text-ink-soft md:border-transparent"
      }`}
    >
      <span aria-hidden="true" className="relative text-2xl leading-none">
        {icon}
        {isNew && <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full border-2 border-paper bg-berry md:hidden" />}
      </span>
      {/* Two lines at most on the rail; a word longer than the rail breaks rather than spilling over. */}
      <span className="line-clamp-2 w-full text-center text-[11px] [overflow-wrap:anywhere] md:line-clamp-none md:w-auto md:min-w-0 md:flex-1 md:text-left md:text-base md:[overflow-wrap:normal] lg:text-lg">
        {label}
      </span>
      {isNew && <span className="hidden shrink-0 rounded-md bg-berry px-1.5 py-0.5 text-xs font-bold text-white md:inline">NEW</span>}
    </button>
  );
}
