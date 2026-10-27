"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdmButton, admInputClass, admLabelClass, admModalActionsClass, admModalBackdropClass, admModalPanelClass } from "@/components/admin/ui";
import { UsdaFoodSearch } from "@/components/admin/UsdaFoodSearch";
import type { RawMaterialDTO, RawMaterialNutrition } from "@zaks/shared-types";

const FIELDS = [
  { key: "calories", label: "Calories (kcal)", max: 900 },
  { key: "protein", label: "Protein (g)", max: 100 },
  { key: "carbs", label: "Carbs (g)", max: 100 },
  { key: "sugar", label: "Sugar (g)", max: 100 },
] as const;

type Per100gText = Record<(typeof FIELDS)[number]["key"], string>;

// A raw material's nutrition per 100 g, for "Calculate from recipe" in the product form
// (Administrator only). Pick the matching USDA FoodData Central food, or type the values
// from a label. Pieces and ml also need a weight, so a recipe's amounts can be turned
// into grams (an egg is about 50 g; most sauces are about 1 g per ml, oil about 0.92).
export function RawMaterialNutritionModal({
  material,
  onClose,
  onSaved,
}: {
  material: RawMaterialDTO;
  onClose: () => void;
  onSaved: (updated: RawMaterialDTO) => void;
}) {
  const current = material.nutrition;
  const [source, setSource] = useState<{ fdcId: number | null; description: string | null }>({
    fdcId: current?.fdcId ?? null,
    description: current?.description ?? null,
  });
  const [values, setValues] = useState<Per100gText>({
    calories: current ? String(current.per100g.calories) : "",
    protein: current ? String(current.per100g.protein) : "",
    carbs: current ? String(current.per100g.carbs) : "",
    sugar: current ? String(current.per100g.sugar) : "",
  });
  const [gramsPerUnit, setGramsPerUnit] = useState(material.gramsPerUnit?.toString() ?? "");
  const [searching, setSearching] = useState(current === null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsWeight = material.unit !== "g";
  const filled = FIELDS.every((f) => values[f.key] !== "" && Number(values[f.key]) >= 0 && Number(values[f.key]) <= f.max);

  async function save(nutrition: RawMaterialNutrition | null) {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<RawMaterialDTO>(`/api/raw-materials/${material.id}`, {
        method: "PUT",
        auth: "staff",
        body: JSON.stringify({
          nutrition,
          ...(needsWeight ? { gramsPerUnit: gramsPerUnit === "" ? null : Number(gramsPerUnit) } : {}),
        }),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the nutrition.");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filled) {
      setError("Fill in all four values per 100 g (calories up to 900, the rest up to 100 g).");
      return;
    }
    if (needsWeight && gramsPerUnit !== "" && !(Number(gramsPerUnit) > 0)) {
      setError(`Enter how many grams one ${material.unit === "pc" ? "piece" : "ml"} weighs, or leave it blank.`);
      return;
    }
    save({
      fdcId: source.fdcId,
      description: source.description,
      per100g: { calories: Number(values.calories), protein: Number(values.protein), carbs: Number(values.carbs), sugar: Number(values.sugar) },
    });
  }

  return (
    <div className={admModalBackdropClass}>
      <form onSubmit={handleSubmit} noValidate className={`${admModalPanelClass} max-w-xl`}>
        <div className="font-adm-mono mb-1 text-xs tracking-[.14em] text-adm-ink-3 uppercase">Nutrition per 100 g</div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight break-words">{material.name}</h2>
        <p className="mb-4 text-sm text-adm-ink-3">Used to calculate a recipe dish&apos;s nutrition. Values are for the raw ingredient.</p>

        {source.description && !searching && (
          <p className="mb-3 text-base md:text-sm">
            Linked to USDA food: <strong>{source.description}</strong>{" "}
            <button type="button" className="text-adm-accent underline" onClick={() => setSearching(true)}>
              Change
            </button>
          </p>
        )}
        {searching ? (
          <div className="mb-3">
            <UsdaFoodSearch
              initialQuery={material.name}
              onPick={(food) => {
                setSource({ fdcId: food.fdcId, description: food.description });
                setValues({
                  calories: String(food.per100g.calories),
                  protein: String(food.per100g.protein),
                  carbs: String(food.per100g.carbs),
                  sugar: String(food.per100g.sugar),
                });
                setSearching(false);
              }}
            />
          </div>
        ) : (
          !source.description && (
            <p className="mb-3 text-sm">
              <button type="button" className="text-adm-accent underline" onClick={() => setSearching(true)}>
                Search USDA FoodData Central
              </button>{" "}
              or type the values below.
            </p>
          )
        )}

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className={admLabelClass}>{f.label}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={f.max}
                step="0.1"
                value={values[f.key]}
                onChange={(e) => {
                  setValues({ ...values, [f.key]: e.target.value });
                  // Typed values no longer match the USDA food exactly.
                  if (source.fdcId) setSource({ fdcId: null, description: source.description ? `${source.description} (edited)` : null });
                }}
                className={admInputClass}
              />
            </label>
          ))}
        </div>

        {needsWeight && (
          <label className="mb-3 block">
            <span className={admLabelClass}>Grams in one {material.unit === "pc" ? "piece" : "ml"}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={gramsPerUnit}
              onChange={(e) => setGramsPerUnit(e.target.value)}
              placeholder={material.unit === "pc" ? "e.g. 50 for an egg" : "1 if left blank"}
              className={`sm:max-w-48 ${admInputClass}`}
            />
            <span className="mt-1 block text-sm text-adm-ink-3">
              {material.unit === "pc"
                ? "Needed: without it, this raw material is left out of the calculation."
                : "Optional: without it, 1 ml counts as 1 g (right for water and most sauces; oil is about 0.92)."}
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="mb-3 text-base text-adm-bad md:text-sm">
            {error}
          </p>
        )}

        <div className={`mt-2 ${admModalActionsClass}`}>
          {current && (
            <AdmButton type="button" variant="danger" onClick={() => save(null)} disabled={saving} className="sm:mr-auto">
              Remove nutrition
            </AdmButton>
          )}
          <AdmButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdmButton>
          <AdmButton type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </AdmButton>
        </div>
      </form>
    </div>
  );
}
