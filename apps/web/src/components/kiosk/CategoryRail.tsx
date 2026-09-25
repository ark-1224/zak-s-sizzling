"use client";

import { useEffect, useState } from "react";
import type { Category } from "@zaks/shared-types";
import { Icon } from "@/components/Icon";

// Ported from kiosk.html's nav.cat-rail / .cat-item (Downloads/kiosk.html, lines 103-134,
// 527-546).
//
// The rail navigates one continuous menu (MenuList): tapping a category scrolls to its
// section, and the highlight follows whichever section is in view. Categories with no
// matching items (e.g. during a search) are dimmed and can't be tapped.
//
// The sidebar stays visible at every width (an adviser/panel requirement). Below md it's
// a 64px rail of category emoji; from md up it shows emoji + name. `title` tooltips never
// show on a touchscreen, so the rail also has a button that opens the same list with full
// names as an overlay.
const FALLBACK_ICON = "🍽️";

interface CategoryRailProps {
  categories: Category[];
  activeCategoryId: number | null;
  disabledIds: Set<number>;
  onSelect: (categoryId: number) => void;
}

// Full class strings per mode so Tailwind can detect every one of them.
const MODE = {
  rail: {
    item: "justify-center rounded-lg md:justify-start md:gap-3 md:rounded-none md:border-l-4 md:px-4 md:py-3 lg:px-5",
    active:
      "bg-matcha/15 font-bold text-matcha-deep md:border-matcha md:bg-transparent md:bg-gradient-to-r md:from-matcha/12 md:to-transparent",
    inactive: "text-ink-soft md:border-transparent",
    label: "hidden md:inline",
    newDot: "md:hidden",
    newTag: "hidden md:inline",
  },
  panel: {
    item: "justify-start gap-3 border-l-4 px-5 py-3",
    active: "border-matcha bg-gradient-to-r from-matcha/12 to-transparent font-bold text-matcha-deep",
    inactive: "border-transparent text-ink-soft",
    label: "inline",
    newDot: "hidden",
    newTag: "inline",
  },
} as const;

export function CategoryRail({ categories, activeCategoryId, disabledIds, onSelect }: CategoryRailProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  function renderItems(mode: keyof typeof MODE, afterSelect?: () => void) {
    return categories.map((c) => (
      <CategoryItem
        key={c.id}
        mode={mode}
        label={c.name}
        icon={c.icon ?? FALLBACK_ICON}
        isNew={c.isNew}
        active={activeCategoryId === c.id}
        disabled={disabledIds.has(c.id)}
        onClick={() => {
          onSelect(c.id);
          afterSelect?.();
        }}
      />
    ));
  }

  return (
    <>
      <nav
        aria-label="Menu categories"
        className="flex w-16 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-paper px-1.5 pt-3 pb-24 md:w-52 md:gap-0 md:px-0 md:pt-4 lg:w-56"
      >
        <button
          onClick={() => setExpanded(true)}
          aria-label="Show category names"
          aria-expanded={expanded}
          title="Show category names"
          className="mb-1 flex min-h-12 w-full items-center justify-center rounded-lg border border-line bg-white text-matcha-deep md:hidden"
        >
          <Icon name="menu" />
        </button>
        {renderItems("rail")}
      </nav>

      {expanded && (
        <>
          <div
            className="animate-fade-in fixed inset-0 z-40 bg-[#22301f]/45 motion-reduce:animate-none md:hidden"
            onClick={() => setExpanded(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu categories"
            className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto bg-paper shadow-2xl md:hidden"
          >
            <div className="flex items-center justify-between border-b border-line py-2 pr-2 pl-5">
              <span className="font-display text-lg font-semibold text-matcha-deep">Categories</span>
              <button
                onClick={() => setExpanded(false)}
                autoFocus
                aria-label="Close category names"
                className="flex h-12 w-12 items-center justify-center rounded-full text-ink"
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="flex flex-col py-2">{renderItems("panel", () => setExpanded(false))}</div>
          </div>
        </>
      )}
    </>
  );
}

function CategoryItem({
  mode,
  label,
  icon,
  isNew,
  active,
  disabled,
  onClick,
}: {
  mode: keyof typeof MODE;
  label: string;
  icon: string;
  isNew: boolean;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const m = MODE[mode];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={isNew ? `${label} (new)` : label}
      aria-current={active ? "true" : undefined}
      title={label}
      className={`flex min-h-12 w-full items-center text-left text-base leading-tight font-medium transition-colors disabled:opacity-35 lg:text-lg ${m.item} ${
        active ? m.active : m.inactive
      }`}
    >
      <span aria-hidden="true" className="relative text-2xl leading-none">
        {icon}
        {isNew && (
          <span className={`absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full border-2 border-paper bg-berry ${m.newDot}`} />
        )}
      </span>
      <span className={`min-w-0 flex-1 ${m.label}`}>{label}</span>
      {isNew && (
        <span className={`shrink-0 rounded-md bg-berry px-1.5 py-0.5 text-xs font-bold text-white ${m.newTag}`}>NEW</span>
      )}
    </button>
  );
}
