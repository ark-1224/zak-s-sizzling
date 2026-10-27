"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdmButton, admInputClass } from "@/components/admin/ui";
import type { NutritionPer100g, UsdaFoodMatch } from "@zaks/shared-types";

/** "518 kcal · protein 9.3 g · carbs 0 g · sugar 0 g", per 100 g. */
export function per100gText(n: NutritionPer100g) {
  return `${n.calories} kcal · protein ${n.protein} g · carbs ${n.carbs} g · sugar ${n.sugar} g`;
}

// Searches USDA FoodData Central through the API (GET /api/nutrition/search, which keeps
// the key on the server) and lets the Administrator pick a food. Values are per 100 g.
export function UsdaFoodSearch({
  initialQuery,
  pickLabel = "Use",
  onPick,
}: {
  initialQuery: string;
  pickLabel?: string;
  onPick: (food: UsdaFoodMatch) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<UsdaFoodMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (query.trim().length < 2) {
      setError("Type at least 2 letters to search.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      setResults(await apiFetch<UsdaFoodMatch[]>(`/api/nutrition/search?q=${encodeURIComponent(query.trim())}`, { auth: "staff" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The search didn't go through. Try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="rounded-[6px] border border-adm-line-soft bg-adm-surface p-3">
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Inside the product form, Enter must search, not save the product.
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="e.g. pork belly raw, white rice cooked"
          aria-label="Search USDA FoodData Central"
          className={admInputClass}
        />
        <AdmButton type="button" variant="secondary" onClick={search} disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </AdmButton>
      </div>
      {error && <p className="mt-2 text-base text-adm-bad md:text-sm">{error}</p>}
      {results && results.length === 0 && <p className="mt-2 text-sm text-adm-ink-3">No match. Try a simpler or English name, e.g. &ldquo;pork&rdquo;.</p>}
      {results && results.length > 0 && (
        <ul className="mt-2 max-h-60 divide-y divide-adm-line-soft overflow-y-auto">
          {results.map((food) => (
            <li key={food.fdcId} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0 text-sm">
                <div className="font-medium break-words">{food.description}</div>
                <div className="text-adm-ink-3">
                  Per 100 g: {per100gText(food.per100g)} · {food.dataType}
                </div>
              </div>
              <AdmButton type="button" variant="secondary" size="compact" onClick={() => onPick(food)}>
                {pickLabel}
              </AdmButton>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-adm-ink-3">Source: U.S. Department of Agriculture, FoodData Central (public domain).</p>
    </div>
  );
}
