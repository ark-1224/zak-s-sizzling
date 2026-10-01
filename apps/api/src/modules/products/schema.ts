import { z } from "zod";

// Matches the manuscript's Add Product Modal wireframe: name, barcode, category,
// price, stock quantity, minimum stock unit, description. Ingredients/allergens/
// nutrition stay editable via direct DB access for now — out of Sprint 4's scope.
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
});

export const updateProductSchema = createProductSchema.partial().extend({
  isAvailable: z.boolean().optional(),
});

export const productIdSchema = z.string().uuid();
