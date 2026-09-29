-- CreateEnum
CREATE TYPE "stock_tracking" AS ENUM ('unit', 'recipe');

-- CreateEnum
CREATE TYPE "material_unit" AS ENUM ('g', 'ml', 'pc');

-- CreateEnum
CREATE TYPE "movement_type" AS ENUM ('sale', 'adjustment', 'restock');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "stock_issue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stock_issue_note" VARCHAR(300);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tracking" "stock_tracking" NOT NULL DEFAULT 'unit';

-- CreateTable
CREATE TABLE "raw_materials" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "unit" "material_unit" NOT NULL,
    "stock_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "min_stock_threshold" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "cost_per_unit" DECIMAL(10,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "product_id" UUID NOT NULL,
    "raw_material_id" UUID NOT NULL,
    "qty_per_serving" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("product_id","raw_material_id")
);

-- CreateTable
CREATE TABLE "raw_material_movements" (
    "id" UUID NOT NULL,
    "raw_material_id" UUID NOT NULL,
    "delta" DECIMAL(12,3) NOT NULL,
    "previous_qty" DECIMAL(12,3) NOT NULL,
    "new_qty" DECIMAL(12,3) NOT NULL,
    "type" "movement_type" NOT NULL,
    "reason" "adjustment_reason",
    "order_id" UUID,
    "adjusted_by_id" UUID,
    "note" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_material_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "raw_materials_name_key" ON "raw_materials"("name");

-- CreateIndex
CREATE INDEX "recipe_items_raw_material_id_idx" ON "recipe_items"("raw_material_id");

-- CreateIndex
CREATE INDEX "raw_material_movements_raw_material_id_idx" ON "raw_material_movements"("raw_material_id");

-- CreateIndex
CREATE INDEX "raw_material_movements_created_at_idx" ON "raw_material_movements"("created_at");

-- CreateIndex
CREATE INDEX "raw_material_movements_order_id_idx" ON "raw_material_movements"("order_id");

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_movements" ADD CONSTRAINT "raw_material_movements_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_movements" ADD CONSTRAINT "raw_material_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_movements" ADD CONSTRAINT "raw_material_movements_adjusted_by_id_fkey" FOREIGN KEY ("adjusted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Stock can never go below zero, enforced by the database itself (design section 2),
-- for raw materials and for unit-tracked products alike.
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_stock_qty_nonnegative" CHECK ("stock_qty" >= 0);
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_min_stock_threshold_nonnegative" CHECK ("min_stock_threshold" >= 0);
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_stock_qty_nonnegative" CHECK ("stock_qty" >= 0);

-- A recipe line must use a positive amount of its raw material.
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_qty_per_serving_positive" CHECK ("qty_per_serving" > 0);
