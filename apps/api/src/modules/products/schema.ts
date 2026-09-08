import { z } from "zod";

// Matches the manuscript's Add Product Modal wireframe: name, barcode, category,
// price, stock quantity, minimum stock unit, description. Ingredients/allergens/
// nutrition stay editable via direct DB access for now — out of Sprint 4's scope.
export const createProductSchema = z.object({
  name: z.string().min(1).max(150),
  price: z.number().nonnegative(),
  barcode: z.string().max(64).optional(),
  categoryId: z.number().int(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(8).optional(),
  stockQty: z.number().int().nonnegative().default(0),
  minStockThreshold: z.number().int().nonnegative().default(5),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isAvailable: z.boolean().optional(),
});
