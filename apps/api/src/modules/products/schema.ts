import { z } from "zod";

// The product form: name, category, price, cost, description and the dish's bill of
// materials (its recipe), plus the ingredients, allergens and nutrition the kiosk shows
// (the nutrition can be looked up from USDA FoodData Central or calculated from the
// recipe, modules/nutrition) and the special-instruction options the kiosk offers.
// Every dish's stock comes from its recipe (panel feedback), so a dish has no stock count
// or minimum of its own. The exception is the Ready-made category (bottled drinks sold as
// they are): those items have no recipe and are counted in pieces, with a minimum.
// One row of a recipe: how much of a raw material (in its base unit: g, ml or pc)
// one serving uses. See docs/design/raw-material-stock.md.
const recipeItemSchema = z.object({
  rawMaterialId: z.string().uuid(),
  qtyPerServing: z.number().positive().max(100_000),
});

const recipeSchema = z
  .array(recipeItemSchema)
  .min(1, "A dish needs at least one raw material in its recipe")
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

// Quick options the kiosk offers as tap-to-add chips ("No onions"). Each one goes into the
// order's special instructions, which hold 140 characters, so options stay short.
const instructionOptionsSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(8)
  .refine((items) => new Set(items.map((i) => i.toLowerCase())).size === items.length, {
    message: "Each special-instruction option can appear only once",
  });

export const createProductSchema = z.object({
  name: z.string().min(1).max(150),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  categoryId: z.number().int(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(8).optional(),
  // Required for a dish, refused for a ready-made item (products/service.ts).
  recipe: recipeSchema.optional(),
  // Ready-made items only: pieces on hand and the minimum before it needs restocking.
  stockQty: z.number().int().min(0).max(100_000).optional(),
  minStockThreshold: z.number().int().min(0).max(100_000).optional(),
  instructionOptions: instructionOptionsSchema.optional(),
  allowInstructions: z.boolean().optional(),
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
