import { z } from "zod";

// Matches the manuscript's Add Product Modal wireframe: name, barcode, category,
// price, stock quantity, minimum stock unit, description; plus the ingredients,
// allergens and nutrition the kiosk shows (the nutrition can be looked up from USDA
// FoodData Central or calculated from the recipe, modules/nutrition).
// One row of a recipe: how much of a raw material (in its base unit: g, ml or pc)
// one serving uses. See docs/design/raw-material-stock.md.
const recipeItemSchema = z.object({
  rawMaterialId: z.string().uuid(),
  qtyPerServing: z.number().positive().max(100_000),
});

const recipeSchema = z
  .array(recipeItemSchema)
  .max(30)
  .refine((items) => new Set(items.map((i) => i.rawMaterialId)).size === items.length, {
    message: "Each raw material can appear only once in a recipe",
  });

// The common food allergens the product form offers as a checklist.
export const ALLERGENS = ["Milk", "Egg", "Fish", "Shellfish", "Peanuts", "Tree nuts", "Gluten", "Soy", "Sesame"] as const;

const nutritionSchema = z.object({
  calories: z.number().int().min(0).max(5000).nullable(),
  protein: z.number().min(0).max(1000).nullable(),
  carbs: z.number().min(0).max(1000).nullable(),
  sugar: z.number().min(0).max(1000).nullable(),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(150),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  barcode: z.string().max(64).optional(),
  categoryId: z.number().int(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(8).optional(),
  stockQty: z.number().int().nonnegative().default(0),
  minStockThreshold: z.number().int().nonnegative().default(5),
  tracking: z.enum(["unit", "recipe"]).optional(),
  recipe: recipeSchema.optional(),
  // Minutes for one serving; 0 for items served as they are (orders/prepTime.ts).
  prepMinutes: z.number().int().min(0).max(120).optional(),
  ingredients: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).optional(),
  // Per serving; values the admin doesn't know stay null (the kiosk leaves them out).
  nutrition: nutritionSchema.optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isAvailable: z.boolean().optional(),
});

export const productIdSchema = z.string().uuid();
