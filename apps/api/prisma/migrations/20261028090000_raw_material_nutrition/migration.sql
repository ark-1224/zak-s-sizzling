-- Nutrition per 100 g for raw materials, linked to a USDA FoodData Central food, and the
-- weight of one piece or one ml, so a recipe dish's nutrition can be estimated.
ALTER TABLE "raw_materials"
  ADD COLUMN "fdc_id" INTEGER,
  ADD COLUMN "fdc_description" VARCHAR(200),
  ADD COLUMN "kcal_per_100g" DECIMAL(7,2),
  ADD COLUMN "protein_per_100g" DECIMAL(6,2),
  ADD COLUMN "carbs_per_100g" DECIMAL(6,2),
  ADD COLUMN "sugar_per_100g" DECIMAL(6,2),
  ADD COLUMN "grams_per_unit" DECIMAL(8,3);
