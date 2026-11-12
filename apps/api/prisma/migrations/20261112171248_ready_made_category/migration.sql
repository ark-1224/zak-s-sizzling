-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "is_ready_made" BOOLEAN NOT NULL DEFAULT false;

-- The built-in "Ready-made" category: items sold as they are (bottled drinks) are
-- counted in pieces, so they need no recipe. A category already called "Ready-made"
-- becomes it; otherwise it is added at the end of the kiosk's rail.
UPDATE "categories" SET "is_ready_made" = true
WHERE "id" = (SELECT "id" FROM "categories" WHERE lower(trim("name")) = 'ready-made' ORDER BY "id" LIMIT 1);

INSERT INTO "categories" ("name", "icon", "sort_order", "is_new", "is_ready_made")
SELECT 'Ready-made', '🥤', COALESCE(MAX("sort_order"), 0) + 1, false, true FROM "categories"
WHERE NOT EXISTS (SELECT 1 FROM "categories" WHERE "is_ready_made");

-- Coke Kasalo and Iced Tea are sold as they are: they move to Ready-made and are
-- counted in pieces again, keeping the count they had before bill of materials.
UPDATE "products"
SET "category_id" = (SELECT "id" FROM "categories" WHERE "is_ready_made" ORDER BY "id" LIMIT 1),
    "tracking" = 'unit'
WHERE lower(trim("name")) IN ('coke kasalo', 'iced tea');

INSERT INTO "inventory" ("product_id", "stock_qty", "min_stock_threshold", "updated_at")
SELECT p."id", 0, 0, now() FROM "products" p
JOIN "categories" c ON c."id" = p."category_id" AND c."is_ready_made"
WHERE NOT EXISTS (SELECT 1 FROM "inventory" i WHERE i."product_id" = p."id");

-- A ready-made item is on sale while it has pieces left.
UPDATE "products" p SET "is_available" = (i."stock_qty" > 0)
FROM "inventory" i, "categories" c
WHERE i."product_id" = p."id" AND c."id" = p."category_id" AND c."is_ready_made";
