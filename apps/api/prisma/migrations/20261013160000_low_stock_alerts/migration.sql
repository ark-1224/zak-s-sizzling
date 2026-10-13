-- CreateTable
CREATE TABLE "low_stock_alerts" (
    "id" UUID NOT NULL,
    "product_id" UUID,
    "raw_material_id" UUID,
    "item_name" VARCHAR(150) NOT NULL,
    "stock_qty" DECIMAL(12,3) NOT NULL,
    "min_stock_threshold" DECIMAL(12,3) NOT NULL,
    "unit" "material_unit",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),

    CONSTRAINT "low_stock_alerts_pkey" PRIMARY KEY ("id"),
    -- Each alert is about exactly one item.
    CONSTRAINT "low_stock_alerts_one_item" CHECK (("product_id" IS NULL) <> ("raw_material_id" IS NULL))
);

-- CreateIndex
CREATE INDEX "low_stock_alerts_sent_at_created_at_idx" ON "low_stock_alerts"("sent_at", "created_at");

-- AddForeignKey
ALTER TABLE "low_stock_alerts" ADD CONSTRAINT "low_stock_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "low_stock_alerts" ADD CONSTRAINT "low_stock_alerts_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Queue an alert when an item *reaches* its minimum: it was above it (or, for a raw
-- material, not in use) before this update and is at or below it after. That covers
-- every way stock changes (sales, adjustments, restocks, edits, bulk import) and also a
-- minimum raised above the current stock. An item that stays low doesn't cross again,
-- so it isn't alerted again until it has been restocked above its minimum.
-- created_at is written in UTC, as Prisma reads these timestamp columns.

-- Unit-counted products only: a recipe dish runs low through its raw materials.
CREATE FUNCTION "queue_product_low_stock_alert"() RETURNS trigger AS $$
BEGIN
  IF NEW."stock_qty" <= NEW."min_stock_threshold" AND OLD."stock_qty" > OLD."min_stock_threshold" THEN
    INSERT INTO "low_stock_alerts" ("id", "product_id", "item_name", "stock_qty", "min_stock_threshold", "created_at")
    SELECT gen_random_uuid(), p."id", p."name", NEW."stock_qty", NEW."min_stock_threshold", now() AT TIME ZONE 'UTC'
    FROM "products" p
    WHERE p."id" = NEW."product_id" AND p."tracking" = 'unit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_low_stock_alert"
AFTER UPDATE OF "stock_qty", "min_stock_threshold" ON "inventory"
FOR EACH ROW EXECUTE FUNCTION "queue_product_low_stock_alert"();

-- Raw materials in use only; reactivating one that is already low counts as reaching it.
CREATE FUNCTION "queue_raw_material_low_stock_alert"() RETURNS trigger AS $$
BEGIN
  IF NEW."is_active" AND NEW."stock_qty" <= NEW."min_stock_threshold"
     AND NOT (OLD."is_active" AND OLD."stock_qty" <= OLD."min_stock_threshold") THEN
    INSERT INTO "low_stock_alerts" ("id", "raw_material_id", "item_name", "stock_qty", "min_stock_threshold", "unit", "created_at")
    VALUES (gen_random_uuid(), NEW."id", NEW."name", NEW."stock_qty", NEW."min_stock_threshold", NEW."unit", now() AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "raw_materials_low_stock_alert"
AFTER UPDATE OF "stock_qty", "min_stock_threshold", "is_active" ON "raw_materials"
FOR EACH ROW EXECUTE FUNCTION "queue_raw_material_low_stock_alert"();
