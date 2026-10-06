import { prisma } from "../../lib/prisma";
import { getIO } from "../../websocket";
import { HttpError } from "../../middleware/errorHandler";
import { PRODUCT_DTO_INCLUDE, toProductDTO } from "../products/service";
import { DECREASE_ONLY_MESSAGE, DECREASE_ONLY_REASONS } from "./schema";
import type { AdjustmentReason, Product, StockAdjustmentDTO } from "@zaks/shared-types";

type StockChange = { setQty?: number; delta?: number; minStockThreshold?: number };
type StockChangeOptions = { decreaseOnly?: boolean };

/**
 * The single place stock ever changes — manual admin adjustments, product-edit stock
 * corrections, and automatic deduction on paid orders all funnel through here, so
 * `isAvailable` and the `inventory:updated` broadcast stay consistent everywhere.
 *
 * Delta-based changes use an atomic conditional update (the stock-sufficiency check
 * and the decrement happen in one SQL statement) rather than read-then-write in JS —
 * two concurrent decrements against the same row (e.g. two kiosk orders paid within
 * the same second) can no longer both read "5 left", both compute "4", and both write
 * "4", silently overselling by one unit. If insufficient stock remains, this throws
 * instead of clamping to 0 and pretending the deduction succeeded.
 */
export async function applyStockChange(
  productId: string,
  change: StockChange,
  { decreaseOnly = false }: StockChangeOptions = {}
): Promise<{ product: Product; previousQty: number; newQty: number }> {
  const inventory = await prisma.inventory.findUnique({ where: { productId }, include: { product: { select: { tracking: true } } } });
  if (!inventory) throw new HttpError(404, "No inventory record for this product");
  // A recipe product's stock is its raw materials (fulfillment.ts); it has no count of its own.
  if (inventory.product.tracking === "recipe") {
    throw new HttpError(409, "This dish uses a recipe, so its stock comes from its raw materials. Adjust those on the Raw materials page.");
  }
  const previousQty = inventory.stockQty;
  if (decreaseOnly) {
    const lowers = change.setQty !== undefined ? change.setQty < previousQty : change.delta !== undefined && change.delta < 0;
    if (!lowers) throw new HttpError(400, DECREASE_ONLY_MESSAGE);
  }

  const product = await prisma.$transaction(async (tx) => {
    if (change.setQty !== undefined) {
      // Absolute override ("set exact count") — not relative arithmetic on a prior
      // read, so there's no lost-update race to guard against here; last-write-wins
      // is the expected behavior for an explicit override.
      await tx.inventory.update({
        where: { productId },
        data: { stockQty: change.setQty, minStockThreshold: change.minStockThreshold ?? inventory.minStockThreshold },
      });
    } else {
      const delta = change.delta ?? 0;
      const result = await tx.inventory.updateMany({
        where: { productId, stockQty: { gte: -delta } }, // no-op guard when delta >= 0
        data: { stockQty: { increment: delta } },
      });
      if (result.count === 0) {
        const current = await tx.inventory.findUniqueOrThrow({ where: { productId } });
        throw new HttpError(409, `Not enough stock for this change — only ${current.stockQty} left`);
      }
      if (change.minStockThreshold !== undefined) {
        await tx.inventory.update({ where: { productId }, data: { minStockThreshold: change.minStockThreshold } });
      }
    }

    const updatedInventory = await tx.inventory.findUniqueOrThrow({ where: { productId } });
    return tx.product.update({
      where: { id: productId },
      data: { isAvailable: updatedInventory.stockQty > 0 },
      include: PRODUCT_DTO_INCLUDE,
    });
  });

  const newQty = product.inventory!.stockQty;
  const dto = toProductDTO(product);
  getIO()?.emit("inventory:updated", { productId, isAvailable: product.isAvailable, stockQty: newQty });
  return { product: dto, previousQty, newQty };
}

/** Manual, authorized stock adjustment — always logged with who/why for the audit trail. */
export async function adjustStock(
  productId: string,
  change: StockChange & { reason?: AdjustmentReason; note?: string },
  adjustedById: string
): Promise<Product> {
  const reason = change.reason;
  const qtyChanged = change.setQty !== undefined || change.delta !== undefined;
  // Checked before anything is saved, so a refused change leaves the stock untouched.
  if (qtyChanged && !reason) throw new HttpError(400, "A reason is required when adjusting stock quantity");
  const decreaseOnly = reason !== undefined && qtyChanged && DECREASE_ONLY_REASONS.includes(reason);
  const { product, previousQty, newQty } = await applyStockChange(productId, change, { decreaseOnly });

  if (qtyChanged && reason) {
    await prisma.stockAdjustment.create({
      data: {
        productId,
        delta: newQty - previousQty,
        previousQty,
        newQty,
        reason,
        note: change.note || null,
        adjustedById,
      },
    });
  }

  return product;
}

export async function listLowStock(): Promise<Product[]> {
  // Comparing two columns of the same row (stock_qty <= min_stock_threshold) isn't
  // expressible in Prisma's standard `where` filters, and the catalog here is small
  // enough (dozens, not millions, of products) that filtering in JS after one fetch
  // is simpler and safer than dropping into raw SQL for it.
  const rows = await prisma.product.findMany({
    include: PRODUCT_DTO_INCLUDE,
    // Recipe products are low when a raw material is; those appear on the Raw materials page.
    where: { tracking: "unit", inventory: { isNot: null } },
    orderBy: { name: "asc" },
  });
  const lowStock = rows.filter((p) => p.inventory && p.inventory.stockQty <= p.inventory.minStockThreshold);
  return lowStock.map(toProductDTO);
}

export async function listStockAdjustments(opts: { productId?: string; limit?: number }): Promise<StockAdjustmentDTO[]> {
  const rows = await prisma.stockAdjustment.findMany({
    where: opts.productId ? { productId: opts.productId } : undefined,
    include: {
      product: { select: { name: true, icon: true } },
      adjustedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
  });

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productName: r.product.name,
    productIcon: r.product.icon,
    delta: r.delta,
    previousQty: r.previousQty,
    newQty: r.newQty,
    reason: r.reason,
    note: r.note,
    adjustedByName: r.adjustedBy.name,
    createdAt: r.createdAt.toISOString(),
  }));
}
