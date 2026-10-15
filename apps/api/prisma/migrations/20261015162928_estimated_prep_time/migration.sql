-- Estimated preparation time (Scope, Payment Transaction; Sprint 3).
--
-- Each product records how many minutes the kitchen needs for one serving (0 for items
-- served as they are, such as bottled drinks). An order's estimate is worked out from
-- its dishes and the kitchen queue (apps/api/src/modules/orders/prepTime.ts) when it is
-- placed, and again when it reaches the kitchen, which also sets when it should be ready.
-- Existing products start at 10 minutes; the administrator adjusts them in the product form.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "estimated_prep_minutes" INTEGER,
ADD COLUMN     "estimated_ready_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "prep_minutes" INTEGER NOT NULL DEFAULT 10;

-- The API accepts 0 to 120 minutes; the database holds the same line.
ALTER TABLE "products" ADD CONSTRAINT "products_prep_minutes_range" CHECK ("prep_minutes" BETWEEN 0 AND 120);
ALTER TABLE "orders" ADD CONSTRAINT "orders_estimated_prep_minutes_nonnegative" CHECK ("estimated_prep_minutes" >= 0);
