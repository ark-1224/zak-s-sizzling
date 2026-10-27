import { HttpError } from "../../middleware/errorHandler";
import type { NutritionPer100g, UsdaFoodMatch } from "@zaks/shared-types";

// USDA FoodData Central (https://fdc.nal.usda.gov), public-domain nutrition data. The
// admin searches it to fill in a dish's or a raw material's nutrition; the kiosk never
// calls it. Values for these generic food types are per 100 g. Needs USDA_API_KEY, a
// free data.gov key, set only in the environment (never in the repository).

const SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
// Generic foods only: Branded (packaged products) floods the results for plain ingredients.
const DATA_TYPES = "Foundation,SR Legacy,Survey (FNDDS)";
const TIMEOUT_MS = 8000;

export class UsdaNotConfiguredError extends HttpError {
  constructor() {
    super(501, "Nutrition lookup isn't set up: add USDA_API_KEY to the API's environment");
  }
}

interface UsdaNutrient {
  nutrientNumber?: string;
  value?: number;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients?: UsdaNutrient[];
}

// USDA nutrient numbers. Foundation foods give energy as Atwater factors (958, 957)
// instead of 208, so those are the fallbacks.
const ENERGY = ["208", "958", "957"];
const PROTEIN = "203";
const CARBS = "205";
const SUGAR = "269";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A food's calories, protein, carbs and sugar per 100 g (missing = 0; never negative). */
export function per100gOf(food: UsdaFood): NutritionPer100g {
  const value = (number: string) => food.foodNutrients?.find((n) => n.nutrientNumber === number)?.value;
  const energy = ENERGY.map(value).find((v) => typeof v === "number");
  // USDA sometimes reports a tiny negative carbohydrate ("by difference"); treat it as 0.
  const amount = (number: string) => Math.max(0, round1(value(number) ?? 0));
  return {
    calories: Math.max(0, Math.round(energy ?? 0)),
    protein: amount(PROTEIN),
    carbs: amount(CARBS),
    sugar: amount(SUGAR),
  };
}

export async function searchUsdaFoods(query: string): Promise<UsdaFoodMatch[]> {
  const key = process.env.USDA_API_KEY;
  if (!key) throw new UsdaNotConfiguredError();

  const url = new URL(SEARCH_URL);
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", query);
  url.searchParams.set("dataType", DATA_TYPES);
  url.searchParams.set("pageSize", "12");

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new HttpError(502, "USDA FoodData Central didn't answer. Try again in a moment.");
  }
  if (res.status === 429) throw new HttpError(429, "USDA's lookup limit was reached. Try again in an hour.");
  if (res.status === 401 || res.status === 403) throw new HttpError(502, "USDA refused the API key. Check USDA_API_KEY.");
  if (!res.ok) throw new HttpError(502, "USDA FoodData Central didn't answer. Try again in a moment.");

  const body = (await res.json()) as { foods?: UsdaFood[] };
  return (body.foods ?? []).map((food) => ({
    fdcId: food.fdcId,
    description: food.description,
    dataType: food.dataType,
    per100g: per100gOf(food),
  }));
}
