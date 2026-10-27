import type { MaterialUnit, NutritionEstimate, NutritionPer100g } from "@zaks/shared-types";

// "Calculate from recipe": a dish's nutrition per serving is the sum, over its recipe, of
// each raw material's share: grams used ÷ 100 × its values per 100 g. Raw values only:
// cooking (oil soaked up, water lost) isn't counted, so the kiosk calls them estimates.

export interface RecipeLine {
  name: string;
  unit: MaterialUnit;
  qtyPerServing: number;
  per100g: NutritionPer100g | null;
  /** Grams in one piece (pc) or one ml (ml). */
  gramsPerUnit: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Grams of one recipe line, or null when a piece has no weight. Ml without a weight counts as 1 g/ml. */
function gramsOf(line: RecipeLine): number | null {
  if (line.unit === "g") return line.qtyPerServing;
  if (line.unit === "ml") return line.qtyPerServing * (line.gramsPerUnit ?? 1);
  return line.gramsPerUnit === null ? null : line.qtyPerServing * line.gramsPerUnit;
}

export function estimateFromRecipe(lines: RecipeLine[]): NutritionEstimate {
  const total = { calories: 0, protein: 0, carbs: 0, sugar: 0 };
  const missing: string[] = [];
  const assumedOneGramPerMl: string[] = [];
  let counted = 0;

  for (const line of lines) {
    const grams = gramsOf(line);
    if (!line.per100g || grams === null) {
      missing.push(line.name);
      continue;
    }
    if (line.unit === "ml" && line.gramsPerUnit === null) assumedOneGramPerMl.push(line.name);
    const share = grams / 100;
    total.calories += line.per100g.calories * share;
    total.protein += line.per100g.protein * share;
    total.carbs += line.per100g.carbs * share;
    total.sugar += line.per100g.sugar * share;
    counted++;
  }

  return {
    // Nothing could be counted: no estimate rather than a misleading zero.
    nutrition:
      counted === 0
        ? { calories: null, protein: null, carbs: null, sugar: null }
        : { calories: Math.round(total.calories), protein: round1(total.protein), carbs: round1(total.carbs), sugar: round1(total.sugar) },
    missing,
    assumedOneGramPerMl,
  };
}
