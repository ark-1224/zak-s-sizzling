-- Dine in or take out (kiosk redesign): chosen on the kiosk right after the welcome
-- screen, shown on the receipt, the kitchen display and the payment queue. Orders placed
-- before this column existed, and any order that doesn't say, count as dine in.

-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('dine_in', 'take_out');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "order_type" "order_type" NOT NULL DEFAULT 'dine_in';
