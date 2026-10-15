-- Product photos (Scope, Product Catalog and Display; Product Catalog Management).
--
-- One photo per product, in its own table so listing the menu never reads image bytes.
-- The admin's browser shrinks each photo to a small WebP or JPEG (about 50 KB) before
-- uploading; the API checks the file really is one of the allowed formats and serves it
-- at GET /api/products/:id/image. Being in the database, photos are in the nightly backup.

-- CreateTable
CREATE TABLE "product_images" (
    "product_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "content_type" VARCHAR(32) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("product_id")
);

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only raster formats a browser shows safely (no SVG, which can carry scripts), and a
-- size cap well above what the browser sends, so a stray large file can't bloat the table.
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_content_type_allowed"
  CHECK ("content_type" IN ('image/webp', 'image/jpeg', 'image/png'));
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_size_limit"
  CHECK (octet_length("data") BETWEEN 1 AND 524288);
