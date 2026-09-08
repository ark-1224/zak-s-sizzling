import { prisma } from "../../lib/prisma";
import { getIO } from "../../websocket";
import { HttpError } from "../../middleware/errorHandler";
import { toProductDTO } from "../products/service";
import type { Product } from "@zaks/shared-types";

/**
 * The single place stock ever changes — manual admin adjustments (Sprint 4) and
 * automatic deduction on paid orders (payments/service.ts) both funnel through here,
 * so `isAvailable` and the `inventory:updated` broadcast stay consistent everywhere.
 */
export async function adjustStock(
  productId: string,
  change: { setQty?: number; delta?: number; minStockThreshold?: number }
): Promise<Product> {
  const inventory = await prisma.inventory.findUnique({ where: { productId } });
  if (!inventory) throw new HttpError(404, "No inventory record for this product");

  const nextQty =
    change.setQty !== undefined ? change.setQty : Math.max(0, inventory.stockQty + (change.delta ?? 0));
  const isAvailable = nextQty > 0;

  const product = await prisma.$transaction(async (tx) => {
    await tx.inventory.update({
      where: { productId },
      data: {
        stockQty: nextQty,
        minStockThreshold: change.minStockThreshold ?? inventory.minStockThreshold,
      },
    });
    return tx.product.update({
      where: { id: productId },
      data: { isAvailable },
      include: { category: true, inventory: true },
    });
  });

  const dto = toProductDTO(product);
  getIO()?.emit("inventory:updated", { productId, isAvailable, stockQty: nextQty });
  return dto;
}

/** Deducts stock for every line in a paid order — called once payment is confirmed. */
export async function deductStockForOrder(orderId: string): Promise<void> {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    await adjustStock(item.productId, { delta: -item.qty });
  }
}

export async function listLowStock(): Promise<Product[]> {
  // Comparing two columns of the same row (stock_qty <= min_stock_threshold) isn't
  // expressible in Prisma's standard `where` filters, and the catalog here is small
  // enough (dozens, not millions, of products) that filtering in JS after one fetch
  // is simpler and safer than dropping into raw SQL for it.
  const rows = await prisma.product.findMany({
    include: { category: true, inventory: true },
    where: { inventory: { isNot: null } },
    orderBy: { name: "asc" },
  });
  const lowStock = rows.filter((p) => p.inventory && p.inventory.stockQty <= p.inventory.minStockThreshold);
  return lowStock.map(toProductDTO);
}
