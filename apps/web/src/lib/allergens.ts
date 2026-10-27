// The common food allergens the product form offers as a checklist. Must match ALLERGENS
// in apps/api/src/modules/products/schema.ts, which refuses anything else.
export const ALLERGENS = ["Milk", "Egg", "Fish", "Shellfish", "Peanuts", "Tree nuts", "Gluten", "Soy", "Sesame"] as const;

export type Allergen = (typeof ALLERGENS)[number];

// Words in an ingredient that usually mean an allergen, including common Filipino names.
// Only a suggestion: the Administrator confirms each one.
const KEYWORDS: Record<Allergen, string[]> = {
  Milk: ["milk", "gatas", "cheese", "keso", "butter", "cream", "evaporada", "condensada", "yogurt", "leche"],
  Egg: ["egg", "itlog", "mayonnaise", "mayo"],
  Fish: ["fish", "isda", "bangus", "tilapia", "tuna", "galunggong", "dilis", "anchovy", "patis", "fish sauce"],
  Shellfish: ["shrimp", "prawn", "hipon", "crab", "alimango", "alimasag", "squid", "pusit", "calamares", "mussel", "tahong", "clam", "halaan", "oyster", "talaba", "alamang"],
  Peanuts: ["peanut", "mani"],
  "Tree nuts": ["cashew", "kasoy", "almond", "walnut", "pili", "hazelnut"],
  Gluten: ["wheat", "flour", "harina", "bread", "tinapay", "breadcrumb", "noodle", "pancit", "canton", "miki", "wrapper", "soy sauce", "toyo"],
  Soy: ["soy", "toyo", "tofu", "tokwa", "taho", "miso"],
  Sesame: ["sesame", "linga"],
};

/** Allergens the ingredients suggest, with the ingredient that suggested each. */
export function suggestAllergens(ingredients: string[]): { allergen: Allergen; because: string }[] {
  const found: { allergen: Allergen; because: string }[] = [];
  for (const allergen of ALLERGENS) {
    const match = ingredients.find((ingredient) => {
      const text = ingredient.toLowerCase();
      return KEYWORDS[allergen].some((word) => new RegExp(`\\b${word}`).test(text));
    });
    if (match) found.push({ allergen, because: match });
  }
  return found;
}
