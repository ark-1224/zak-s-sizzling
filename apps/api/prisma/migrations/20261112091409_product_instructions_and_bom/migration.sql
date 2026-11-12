-- AlterTable
ALTER TABLE "products" ADD COLUMN     "allow_instructions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "instruction_options" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "tracking" SET DEFAULT 'recipe';

-- Quick special-instruction options move from code (apps/web/src/lib/instructionChips.ts,
-- chosen by category) onto each product, so the admin can edit them per dish. Existing
-- products start with the options their category offered before.
UPDATE "products" p SET "instruction_options" = CASE lower(trim(c."name"))
    WHEN 'sizzling plates' THEN ARRAY['Extra spicy', 'Not spicy', 'No onions', 'Well done', 'Sauce on the side']
    WHEN 'rice & noodles' THEN ARRAY['Less oil', 'No onions']
    WHEN 'soups & stews' THEN ARRAY['Less salty', 'No onions', 'Extra hot']
    WHEN 'sides' THEN ARRAY['Sauce on the side', 'Less oil']
    WHEN 'drinks' THEN ARRAY['Less ice', 'No ice', 'Less sugar']
    WHEN 'specials' THEN ARRAY['Extra crispy', 'Sauce on the side', 'No onions']
    ELSE ARRAY[]::TEXT[]
  END
FROM "categories" c
WHERE c."id" = p."category_id";

-- Bill of materials for every dish (panel feedback): stock now always comes from the
-- recipe. A product that was counted in units has no recipe yet, so it can't be made
-- until one is added: it shows as sold out until then. Its old count stays in
-- "inventory" (history only).
UPDATE "products" SET "tracking" = 'recipe' WHERE "tracking" = 'unit';
UPDATE "products" p SET "is_available" = false
WHERE NOT EXISTS (SELECT 1 FROM "recipe_items" r WHERE r."product_id" = p."id");
