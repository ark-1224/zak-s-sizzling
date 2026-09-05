"use client";

import type { Nutrition } from "@zaks/shared-types";

// Ported from kiosk.html's .nutri-grid (Downloads/kiosk.html, lines 252-262, 646-652).
export function NutritionGrid({ nutrition }: { nutrition: Nutrition }) {
  const cells: { label: string; value: string }[] = [
    { label: "calories", value: `${nutrition.calories ?? "—"}` },
    { label: "protein", value: `${nutrition.protein ?? "—"}g` },
    { label: "carbs", value: `${nutrition.carbs ?? "—"}g` },
    { label: "sugar", value: `${nutrition.sugar ?? "—"}g` },
  ];

  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-line">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={`bg-white px-2 py-3 text-center ${i < cells.length - 1 ? "border-r border-line" : ""}`}
        >
          <div className="font-display text-[17px] font-bold text-matcha-deep">{c.value}</div>
          <div className="mt-0.5 text-[10.5px] text-ink-soft">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
