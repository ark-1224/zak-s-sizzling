-- Cancelling some dishes of an order (POST /api/orders/:id/cancel-items): a line keeps
-- what is still ordered in qty and what was cancelled in cancelled_qty, so a line
-- cancelled whole stays on the order, with qty 0, as a record of what was ordered.
ALTER TABLE "order_items" ADD COLUMN "cancelled_qty" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_qty_nonnegative" CHECK ("qty" >= 0 AND "cancelled_qty" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_something_ordered" CHECK ("qty" + "cancelled_qty" > 0);
