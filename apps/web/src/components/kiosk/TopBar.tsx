"use client";

import type { OrderType } from "@zaks/shared-types";
import { Icon } from "@/components/Icon";

// The menu's top bar, part of the kiosk's dark "char" frame: the logo, the dine-in /
// take-out switch (chosen on the screen before, changeable here with one tap), search,
// and Start over (empties the order and goes back to the welcome screen).
//
// On a phone it takes two rows: logo, switch and Start over, then search full width.
interface TopBarProps {
  orderType: OrderType | null;
  onOrderTypeChange: (orderType: OrderType) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onStartOver: () => void;
}

const TYPES: { value: OrderType; label: string }[] = [
  { value: "dine_in", label: "Dine in" },
  { value: "take_out", label: "Take out" },
];

export function TopBar({ orderType, onOrderTypeChange, searchQuery, onSearchChange, onStartOver }: TopBarProps) {
  return (
    <header className="flex shrink-0 flex-col gap-2 border-b-2 border-honey/50 bg-char px-3 py-2 text-cream sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="flex items-center gap-2.5 sm:contents">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="Zak's Sizzling Hub" className="h-10 w-10 shrink-0 rounded-[50%_50%_50%_8px] object-cover" />
        <span className="font-display hidden text-xl leading-none font-bold whitespace-nowrap xl:block">Zak&apos;s Sizzling Hub</span>

        <div role="radiogroup" aria-label="Dine in or take out" className="flex shrink-0 rounded-full bg-char-soft p-1">
          {TYPES.map((t) => {
            const selected = orderType === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onOrderTypeChange(t.value)}
                className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-base font-semibold whitespace-nowrap transition-colors ${
                  selected ? "bg-honey text-char" : "text-cream/75"
                }`}
              >
                <Icon name={t.value === "dine_in" ? "dineIn" : "takeOut"} className="h-5 w-5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onStartOver}
          aria-label="Start over"
          className="ml-auto flex min-h-12 shrink-0 items-center gap-2 rounded-full px-3 text-base font-semibold text-cream/85 active:bg-white/10 sm:order-last sm:ml-0"
        >
          <Icon name="restart" className="h-5 w-5" />
          <span className="hidden md:inline">Start over</span>
        </button>
      </div>

      <label className="flex min-h-12 min-w-0 flex-1 cursor-text items-center gap-2.5 rounded-full bg-cream px-4 text-ink focus-within:ring-2 focus-within:ring-honey">
        <Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search the menu"
          aria-label="Search the menu"
          autoComplete="off"
          className="h-12 w-full min-w-0 bg-transparent text-lg placeholder:text-ink-soft focus-visible:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft active:bg-paper"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        )}
      </label>
    </header>
  );
}
