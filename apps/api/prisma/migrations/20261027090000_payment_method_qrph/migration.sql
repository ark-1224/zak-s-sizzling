-- Online payment becomes QR Ph (PayMongo). Adds the value only; existing payments keep
-- their method, and gcash / maya stay valid for them.
ALTER TYPE "payment_method" ADD VALUE 'qrph';
