import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { estimateFromRecipe } from "./calc";
import { searchUsdaFoods } from "./usda";

export const nutritionRouter = Router();

const searchSchema = z.object({ q: z.string().trim().min(2, "Type at least 2 letters to search").max(100) });

const estimateSchema = z.object({
  recipe: z
    .array(z.object({ rawMaterialId: z.string().uuid(), qtyPerServing: z.number().positive().max(100_000) }))
    .min(1, "Add at least one raw material to the recipe first")
    .max(30),
});

// Search USDA FoodData Central (Administrator only; the key stays on the server).
nutritionRouter.get("/search", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await searchUsdaFoods(searchSchema.parse(req.query).q));
  } catch (err) {
    next(err);
  }
});

// "Calculate from recipe" for the product form: the recipe as it is on screen (it may
// not be saved yet), worked out from each raw material's nutrition per 100 g.
nutritionRouter.post("/estimate", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const { recipe } = estimateSchema.parse(req.body);
    const materials = await prisma.rawMaterial.findMany({ where: { id: { in: recipe.map((r) => r.rawMaterialId) } } });
    const byId = new Map(materials.map((m) => [m.id, m]));
    if (byId.size !== new Set(recipe.map((r) => r.rawMaterialId)).size) {
      throw new HttpError(404, "One of the raw materials in the recipe doesn't exist");
    }
    res.json(
      estimateFromRecipe(
        recipe.map((r) => {
          const m = byId.get(r.rawMaterialId)!;
          return {
            name: m.name,
            unit: m.unit,
            qtyPerServing: r.qtyPerServing,
            gramsPerUnit: m.gramsPerUnit === null ? null : Number(m.gramsPerUnit),
            per100g:
              m.kcalPer100g === null
                ? null
                : {
                    calories: Number(m.kcalPer100g),
                    protein: Number(m.proteinPer100g ?? 0),
                    carbs: Number(m.carbsPer100g ?? 0),
                    sugar: Number(m.sugarPer100g ?? 0),
                  },
          };
        })
      )
    );
  } catch (err) {
    next(err);
  }
});
