-- Market purchasing and the palengke cycle: market units (unit conversion), purchase
-- receipts with their lines (price history), per-item planning (par level, safety stock,
-- storage, shelf life), stock counts (variance), the cost of each sale when it was paid
-- (food cost), and two more waste reasons.

-- CreateEnum
CREATE TYPE "storage_type" AS ENUM ('frozen', 'chilled', 'room');

-- CreateEnum
CREATE TYPE "purchase_kind" AS ENUM ('market_trip', 'top_up');

-- AlterEnum


ALTER TYPE "adjustment_reason" ADD VALUE 'dropped';
ALTER TYPE "adjustment_reason" ADD VALUE 'over_prepped';

-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "par_level" INTEGER,
ADD COLUMN     "safety_stock" INTEGER,
ADD COLUMN     "shelf_life_days" INTEGER,
ADD COLUMN     "storage" "storage_type";

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "unit_cost" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "raw_material_movements" ADD COLUMN     "purchase_id" UUID,
ADD COLUMN     "stock_count_id" UUID;

-- AlterTable
ALTER TABLE "raw_materials" ADD COLUMN     "par_level" DECIMAL(12,3),
ADD COLUMN     "safety_stock" DECIMAL(12,3),
ADD COLUMN     "shelf_life_days" INTEGER,
ADD COLUMN     "storage" "storage_type";

-- AlterTable
ALTER TABLE "stock_adjustments" ADD COLUMN     "purchase_id" UUID,
ADD COLUMN     "stock_count_id" UUID;

-- CreateTable
CREATE TABLE "purchase_units" (
    "id" UUID NOT NULL,
    "raw_material_id" UUID,
    "product_id" UUID,
    "name" VARCHAR(40) NOT NULL,
    "qty_in_base" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "purchased_on" DATE NOT NULL,
    "kind" "purchase_kind" NOT NULL DEFAULT 'market_trip',
    "store" VARCHAR(120),
    "note" VARCHAR(200),
    "total_amount" DECIMAL(10,2) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "raw_material_id" UUID,
    "product_id" UUID,
    "unit_name" VARCHAR(40) NOT NULL,
    "unit_qty_in_base" DECIMAL(12,3) NOT NULL,
    "qty_units" DECIMAL(10,3) NOT NULL,
    "qty_base" DECIMAL(12,3) NOT NULL,
    "line_total" DECIMAL(10,2) NOT NULL,
    "planned_units" DECIMAL(10,3),
    "expires_on" DATE,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "counted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(200),
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" UUID NOT NULL,
    "stock_count_id" UUID NOT NULL,
    "raw_material_id" UUID,
    "product_id" UUID,
    "system_qty" DECIMAL(12,3) NOT NULL,
    "counted_qty" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(12,4),

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_units_raw_material_id_name_key" ON "purchase_units"("raw_material_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_units_product_id_name_key" ON "purchase_units"("product_id", "name");

-- CreateIndex
CREATE INDEX "purchases_purchased_on_idx" ON "purchases"("purchased_on");

-- CreateIndex
CREATE INDEX "purchase_lines_purchase_id_idx" ON "purchase_lines"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_lines_raw_material_id_idx" ON "purchase_lines"("raw_material_id");

-- CreateIndex
CREATE INDEX "purchase_lines_product_id_idx" ON "purchase_lines"("product_id");

-- CreateIndex
CREATE INDEX "stock_counts_counted_at_idx" ON "stock_counts"("counted_at");

-- CreateIndex
CREATE INDEX "stock_count_lines_stock_count_id_idx" ON "stock_count_lines"("stock_count_id");

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_movements" ADD CONSTRAINT "raw_material_movements_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_movements" ADD CONSTRAINT "raw_material_movements_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_units" ADD CONSTRAINT "purchase_units_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_units" ADD CONSTRAINT "purchase_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Each market unit, purchase line and count line points at exactly one stock item: a raw
-- material or a ready-made item (product).
ALTER TABLE "purchase_units" ADD CONSTRAINT "purchase_units_one_item" CHECK (("raw_material_id" IS NULL) <> ("product_id" IS NULL));
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_one_item" CHECK (("raw_material_id" IS NULL) <> ("product_id" IS NULL));
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_one_item" CHECK (("raw_material_id" IS NULL) <> ("product_id" IS NULL));

-- Amounts are never negative; a unit holds something; a line may record 0 bought (planned
-- on the shopping list but not found at the market).
ALTER TABLE "purchase_units" ADD CONSTRAINT "purchase_units_qty_positive" CHECK ("qty_in_base" > 0);
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_amounts_nonnegative"
  CHECK ("qty_units" >= 0 AND "qty_base" >= 0 AND "line_total" >= 0 AND "unit_qty_in_base" > 0 AND ("planned_units" IS NULL OR "planned_units" >= 0));
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_total_nonnegative" CHECK ("total_amount" >= 0);
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_qty_nonnegative" CHECK ("counted_qty" >= 0);
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_planning_nonnegative"
  CHECK (("par_level" IS NULL OR "par_level" >= 0) AND ("safety_stock" IS NULL OR "safety_stock" >= 0) AND ("shelf_life_days" IS NULL OR "shelf_life_days" > 0));
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_planning_nonnegative"
  CHECK (("par_level" IS NULL OR "par_level" >= 0) AND ("safety_stock" IS NULL OR "safety_stock" >= 0) AND ("shelf_life_days" IS NULL OR "shelf_life_days" > 0));
