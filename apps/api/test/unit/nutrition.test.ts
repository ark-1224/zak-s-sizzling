import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateFromRecipe, type RecipeLine } from "../../src/modules/nutrition/calc";
import { per100gOf, searchUsdaFoods } from "../../src/modules/nutrition/usda";

const per100g = (calories: number, protein: number, carbs: number, sugar: number) => ({ calories, protein, carbs, sugar });
const line = (over: Partial<RecipeLine>): RecipeLine => ({
  name: "Item",
  unit: "g",
  qtyPerServing: 100,
  per100g: per100g(100, 10, 10, 1),
  gramsPerUnit: null,
  ...over,
});

describe("estimateFromRecipe", () => {
  it("adds up each ingredient's share of its values per 100 g", () => {
    const result = estimateFromRecipe([
      line({ name: "Pork belly", qtyPerServing: 150, per100g: per100g(518, 9.3, 0, 0) }),
      line({ name: "Rice", qtyPerServing: 200, per100g: per100g(130, 2.7, 28.2, 0.1) }),
    ]);
    expect(result.nutrition).toEqual({ calories: 1037, protein: 19.4, carbs: 56.4, sugar: 0.2 });
    expect(result.missing).toEqual([]);
  });

  it("weighs pieces with their grams per piece", () => {
    const result = estimateFromRecipe([line({ name: "Egg", unit: "pc", qtyPerServing: 1, gramsPerUnit: 50, per100g: per100g(143, 12.6, 0.7, 0.4) })]);
    expect(result.nutrition.calories).toBe(72);
    expect(result.nutrition.protein).toBe(6.3);
  });

  it("leaves out a piece with no weight, and an ingredient with no nutrition, and says so", () => {
    const result = estimateFromRecipe([
      line({ name: "Rice" }),
      line({ name: "Egg", unit: "pc", qtyPerServing: 1, gramsPerUnit: null }),
      line({ name: "Calamansi", per100g: null }),
    ]);
    expect(result.nutrition.calories).toBe(100);
    expect(result.missing).toEqual(["Egg", "Calamansi"]);
  });

  it("counts ml as 1 g per ml unless a weight is set, and lists the ones assumed", () => {
    const water = estimateFromRecipe([line({ name: "Soy sauce", unit: "ml", qtyPerServing: 10, per100g: per100g(53, 8, 4.9, 0.4) })]);
    expect(water.nutrition.calories).toBe(5);
    expect(water.assumedOneGramPerMl).toEqual(["Soy sauce"]);

    const oil = estimateFromRecipe([line({ name: "Oil", unit: "ml", qtyPerServing: 10, gramsPerUnit: 0.92, per100g: per100g(884, 0, 0, 0) })]);
    expect(oil.nutrition.calories).toBe(81);
    expect(oil.assumedOneGramPerMl).toEqual([]);
  });

  it("gives no estimate when nothing could be counted", () => {
    const result = estimateFromRecipe([line({ per100g: null })]);
    expect(result.nutrition).toEqual({ calories: null, protein: null, carbs: null, sugar: null });
  });
});

describe("per100gOf (USDA FoodData Central)", () => {
  it("reads energy, protein, carbohydrate and sugar by nutrient number", () => {
    expect(
      per100gOf({
        fdcId: 1,
        description: "Pork, fresh, belly, raw",
        dataType: "SR Legacy",
        foodNutrients: [
          { nutrientNumber: "208", value: 518 },
          { nutrientNumber: "203", value: 9.34 },
          { nutrientNumber: "205", value: 0 },
          { nutrientNumber: "269", value: 0 },
        ],
      })
    ).toEqual({ calories: 518, protein: 9.3, carbs: 0, sugar: 0 });
  });

  it("falls back to the Atwater energy of Foundation foods, and never goes below zero", () => {
    expect(
      per100gOf({
        fdcId: 2,
        description: "Pork, belly, with skin, raw",
        dataType: "Foundation",
        foodNutrients: [
          { nutrientNumber: "958", value: 385 },
          { nutrientNumber: "957", value: 380 },
          { nutrientNumber: "203", value: 15.2 },
          { nutrientNumber: "205", value: -0.705 },
        ],
      })
    ).toEqual({ calories: 385, protein: 15.2, carbs: 0, sugar: 0 });
  });
});

describe("searchUsdaFoods", () => {
  const saved = process.env.USDA_API_KEY;
  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = saved;
  });

  it("says the lookup isn't set up without a key", async () => {
    delete process.env.USDA_API_KEY;
    await expect(searchUsdaFoods("rice")).rejects.toMatchObject({ status: 501 });
  });

  it("asks for generic foods and maps each match", async () => {
    process.env.USDA_API_KEY = "test-key";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ foods: [{ fdcId: 7, description: "Rice, white, cooked", dataType: "SR Legacy", foodNutrients: [{ nutrientNumber: "208", value: 130 }] }] }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const matches = await searchUsdaFoods("rice");
    expect(matches).toEqual([{ fdcId: 7, description: "Rice, white, cooked", dataType: "SR Legacy", per100g: { calories: 130, protein: 0, carbs: 0, sugar: 0 } }]);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("query")).toBe("rice");
    expect(url.searchParams.get("dataType")).toBe("Foundation,SR Legacy,Survey (FNDDS)");
  });

  it("explains USDA's hourly limit", async () => {
    process.env.USDA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(searchUsdaFoods("rice")).rejects.toMatchObject({ status: 429 });
  });
});
