"use client";

import type { Nutrition } from "@zaks/shared-types";

// Ported from kiosk.html's .nutri-grid (Downloads/kiosk.html, lines 252-262, 646-652).
// The values are estimates (looked up in USDA FoodData Central or calculated from the
// recipe's raw ingredients), and the grid says so.
export function NutritionGrid({ nutrition }: { nutrition: Nutrition }) {
  const cells: { label: string; value: string }[] = [
    { label: "calories", value: `${nutrition.calories ?? "—"}` },
    { label: "protein", value: `${nutrition.protein ?? "—"}g` },
    { label: "carbs", value: `${nutrition.carbs ?? "—"}g` },
    { label: "sugar", value: `${nutrition.sugar ?? "—"}g` },
  ];

  return (
    <div>
      <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-line">
        {cells.map((c, i) => (
          <div
            key={c.label}
            className={`min-w-0 bg-white px-1 py-3 text-center sm:px-2 ${i < cells.length - 1 ? "border-r border-line" : ""}`}
          >
            <div className="font-display text-base font-bold break-words text-matcha-deep sm:text-[17px]">{c.value}</div>
            <div className="mt-0.5 text-xs text-ink-soft">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-ink-soft">Estimated values per serving.</p>
    </div>
  );
}
