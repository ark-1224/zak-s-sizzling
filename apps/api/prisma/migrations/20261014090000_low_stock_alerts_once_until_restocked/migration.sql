-- Low-stock notifications 3/3: notify once per item until it has been restocked.
--
-- The first version alerted whenever an item went from "not low" to "low". An item
-- could also stop being low without any restock (its minimum lowered, or a raw
-- material taken out of use) and then alert again. Now an alert stays open until the
-- item is restocked, meaning its stock goes up and ends above the minimum, and no new
-- alert is queued for an item that still has an open one.

-- AlterTable
ALTER TABLE "low_stock_alerts" ADD COLUMN "resolved_at" TIMESTAMP(3);

-- CreateIndex (the trigger looks up an item's open alert)
CREATE INDEX "low_stock_alerts_product_id_idx" ON "low_stock_alerts"("product_id");

-- CreateIndex
CREATE INDEX "low_stock_alerts_raw_material_id_idx" ON "low_stock_alerts"("raw_material_id");

-- Two updates of the same item can't both pass the "no open alert" check: the second
-- waits for the first's row lock on inventory / raw_materials, and in READ COMMITTED
-- each statement in the function sees what the first committed.

CREATE OR REPLACE FUNCTION "queue_product_low_stock_alert"() RETURNS trigger AS $$
BEGIN
  -- Restocked: the stock went up and is above the minimum again.
  IF NEW."stock_qty" > OLD."stock_qty" AND NEW."stock_qty" > NEW."min_stock_threshold" THEN
    UPDATE "low_stock_alerts" SET "resolved_at" = now() AT TIME ZONE 'UTC'
    WHERE "product_id" = NEW."product_id" AND "resolved_at" IS NULL;
  ELSIF NEW."stock_qty" <= NEW."min_stock_threshold"
        AND NOT EXISTS (SELECT 1 FROM "low_stock_alerts" WHERE "product_id" = NEW."product_id" AND "resolved_at" IS NULL) THEN
    INSERT INTO "low_stock_alerts" ("id", "product_id", "item_name", "stock_qty", "min_stock_threshold", "created_at")
    SELECT gen_random_uuid(), p."id", p."name", NEW."stock_qty", NEW."min_stock_threshold", now() AT TIME ZONE 'UTC'
    FROM "products" p
    WHERE p."id" = NEW."product_id" AND p."tracking" = 'unit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "queue_raw_material_low_stock_alert"() RETURNS trigger AS $$
BEGIN
  IF NEW."stock_qty" > OLD."stock_qty" AND NEW."stock_qty" > NEW."min_stock_threshold" THEN
    UPDATE "low_stock_alerts" SET "resolved_at" = now() AT TIME ZONE 'UTC'
    WHERE "raw_material_id" = NEW."id" AND "resolved_at" IS NULL;
  ELSIF NEW."is_active" AND NEW."stock_qty" <= NEW."min_stock_threshold"
        AND NOT EXISTS (SELECT 1 FROM "low_stock_alerts" WHERE "raw_material_id" = NEW."id" AND "resolved_at" IS NULL) THEN
    INSERT INTO "low_stock_alerts" ("id", "raw_material_id", "item_name", "stock_qty", "min_stock_threshold", "unit", "created_at")
    VALUES (gen_random_uuid(), NEW."id", NEW."name", NEW."stock_qty", NEW."min_stock_threshold", NEW."unit", now() AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
