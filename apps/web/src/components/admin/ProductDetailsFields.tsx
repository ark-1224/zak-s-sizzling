"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ALLERGENS, suggestAllergens } from "@/lib/allergens";
import { AdmButton, admInputClass, admLabelClass } from "@/components/admin/ui";
import { UsdaFoodSearch } from "@/components/admin/UsdaFoodSearch";
import type { NutritionEstimate } from "@zaks/shared-types";

export interface NutritionText {
  calories: string;
  protein: string;
  carbs: string;
  sugar: string;
}

const NUTRITION_FIELDS = [
  { key: "calories", label: "Calories (kcal)", step: "1" },
  { key: "protein", label: "Protein (g)", step: "0.1" },
  { key: "carbs", label: "Carbs (g)", step: "0.1" },
  { key: "sugar", label: "Sugar (g)", step: "0.1" },
] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

// The product form's ingredients, allergens and nutrition per serving, which the kiosk
// shows on the dish's details. Nutrition can be looked up for the whole dish in USDA
// FoodData Central, or calculated from the dish's recipe (each raw material's values per
// 100 g, set on the Raw materials page). Allergens are a checklist, with suggestions
// from the ingredients that the Administrator confirms.
export function ProductDetailsFields({
  ingredients,
  onIngredientsChange,
  allergens,
  onAllergensChange,
  nutrition,
  onNutritionChange,
  productName,
  recipeNames,
  recipe,
}: {
  ingredients: string[];
  onIngredientsChange: (next: string[]) => void;
  allergens: string[];
  onAllergensChange: (next: string[]) => void;
  nutrition: NutritionText;
  onNutritionChange: (next: NutritionText) => void;
  productName: string;
  /** Raw material names of the recipe on screen (recipe dishes only). */
  recipeNames: string[] | null;
  /** The recipe on screen, for "Calculate from recipe"; null when there is none yet. */
  recipe: { rawMaterialId: string; qtyPerServing: number }[] | null;
}) {
  const [newIngredient, setNewIngredient] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [servingGrams, setServingGrams] = useState("300");
  const [calculating, setCalculating] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  function addIngredients(names: string[]) {
    const next = [...ingredients];
    for (const raw of names) {
      const name = raw.trim().slice(0, 60);
      if (name && !next.some((i) => i.toLowerCase() === name.toLowerCase())) next.push(name);
    }
    onIngredientsChange(next.slice(0, 40));
  }

  const suggestions = suggestAllergens(ingredients).filter((s) => !allergens.includes(s.allergen));

  async function calculateFromRecipe() {
    if (!recipe) return;
    setCalculating(true);
    setNote(null);
    try {
      const estimate = await apiFetch<NutritionEstimate>("/api/nutrition/estimate", { method: "POST", auth: "staff", body: JSON.stringify({ recipe }) });
      if (estimate.nutrition.calories === null) {
        setNote({ text: "None of the recipe's raw materials has nutrition yet. Set it on the Raw materials page (Nutrition).", error: true });
        return;
      }
      onNutritionChange({
        calories: String(estimate.nutrition.calories),
        protein: String(estimate.nutrition.protein),
        carbs: String(estimate.nutrition.carbs),
        sugar: String(estimate.nutrition.sugar),
      });
      const parts = ["Calculated from the recipe (raw ingredients; cooking isn't counted)."];
      if (estimate.missing.length) parts.push(`Left out, with no nutrition or no weight per piece: ${estimate.missing.join(", ")}.`);
      if (estimate.assumedOneGramPerMl.length) parts.push(`Counted as 1 g per ml: ${estimate.assumedOneGramPerMl.join(", ")}.`);
      setNote({ text: parts.join(" "), error: estimate.missing.length > 0 });
    } catch (err) {
      setNote({ text: err instanceof ApiError ? err.message : "Could not calculate from the recipe.", error: true });
    } finally {
      setCalculating(false);
    }
  }

  return (
    <fieldset className="mb-3 rounded-[6px] border border-adm-line-soft bg-adm-bg p-3">
      <legend className="px-1 text-sm font-medium text-adm-ink-2">Ingredients, allergens and nutrition</legend>

      <span id="pf-ingredients-label" className={admLabelClass}>
        Ingredients
      </span>
      {ingredients.length > 0 && (
        <ul aria-labelledby="pf-ingredients-label" className="mb-2 flex flex-wrap gap-1.5">
          {ingredients.map((name) => (
            <li key={name} className="flex items-center gap-1 rounded-full border border-adm-line bg-adm-surface py-0.5 pr-1 pl-2.5 text-sm">
              {name}
              <button
                type="button"
                onClick={() => onIngredientsChange(ingredients.filter((i) => i !== name))}
                aria-label={`Remove ${name}`}
                className="flex h-7 w-7 items-center justify-center rounded-full text-adm-ink-3 hover:bg-adm-surface-2"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mb-1 flex gap-2">
        <input
          value={newIngredient}
          onChange={(e) => setNewIngredient(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addIngredients(newIngredient.split(","));
              setNewIngredient("");
            }
          }}
          placeholder="Type an ingredient, then Enter"
          aria-labelledby="pf-ingredients-label"
          className={admInputClass}
        />
        <AdmButton
          type="button"
          variant="secondary"
          onClick={() => {
            addIngredients(newIngredient.split(","));
            setNewIngredient("");
          }}
        >
          Add
        </AdmButton>
      </div>
      {recipeNames && recipeNames.length > 0 && (
        <button type="button" onClick={() => addIngredients(recipeNames)} className="mb-3 text-sm text-adm-accent underline">
          Add the recipe&apos;s raw materials as ingredients
        </button>
      )}

      <fieldset className="mt-2 mb-3">
        <legend className={admLabelClass}>Allergens</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
          {ALLERGENS.map((allergen) => (
            <label key={allergen} className="flex min-h-9 items-center gap-2 text-base md:text-sm">
              <input
                type="checkbox"
                checked={allergens.includes(allergen)}
                onChange={(e) =>
                  onAllergensChange(e.target.checked ? [...allergens, allergen] : allergens.filter((a) => a !== allergen))
                }
                className="h-4.5 w-4.5"
              />
              {allergen}
            </label>
          ))}
        </div>
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-adm-ink-2">
            Suggested from the ingredients:
            {suggestions.map((s) => (
              <AdmButton
                key={s.allergen}
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => onAllergensChange([...allergens, s.allergen])}
                title={`Because of "${s.because}"`}
              >
                + {s.allergen} ({s.because})
              </AdmButton>
            ))}
          </div>
        )}
      </fieldset>

      <span className={admLabelClass}>Nutrition per serving</span>
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUTRITION_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-xs text-adm-ink-3">{f.label}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={f.step}
              value={nutrition[f.key]}
              onChange={(e) => onNutritionChange({ ...nutrition, [f.key]: e.target.value })}
              className={admInputClass}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <AdmButton type="button" variant="secondary" size="compact" onClick={() => setLookingUp((v) => !v)}>
          {lookingUp ? "Close lookup" : "Look up the dish (USDA)"}
        </AdmButton>
        {recipe && (
          <AdmButton type="button" variant="secondary" size="compact" onClick={calculateFromRecipe} disabled={calculating}>
            {calculating ? "Calculating…" : "Calculate from recipe"}
          </AdmButton>
        )}
      </div>
      {lookingUp && (
        <div className="mt-2">
          <label className="mb-2 flex items-center gap-2 text-base md:text-sm">
            Serving size
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={servingGrams}
              onChange={(e) => setServingGrams(e.target.value)}
              className={`w-24 ${admInputClass}`}
              aria-label="Serving size in grams"
            />
            g
          </label>
          <UsdaFoodSearch
            initialQuery={productName}
            pickLabel="Use for this serving"
            onPick={(food) => {
              const grams = Number(servingGrams);
              if (!(grams > 0)) {
                setNote({ text: "Enter the serving size in grams first.", error: true });
                return;
              }
              const share = grams / 100;
              onNutritionChange({
                calories: String(Math.round(food.per100g.calories * share)),
                protein: String(round1(food.per100g.protein * share)),
                carbs: String(round1(food.per100g.carbs * share)),
                sugar: String(round1(food.per100g.sugar * share)),
              });
              setNote({ text: `From USDA: ${food.description}, scaled to ${grams} g.`, error: false });
              setLookingUp(false);
            }}
          />
        </div>
      )}
      {note && <p className={`mt-2 text-sm ${note.error ? "text-adm-bad" : "text-adm-ink-2"}`}>{note.text}</p>}
      <p className="mt-2 text-xs text-adm-ink-3">The kiosk shows these as estimated values. Leave a value blank if it isn&apos;t known.</p>
    </fieldset>
  );
}
