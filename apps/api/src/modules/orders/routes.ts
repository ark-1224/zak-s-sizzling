import { Router } from "express";
import { Prisma } from "@prisma/client";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { prisma } from "../../lib/prisma";
import { createOrderSchema } from "./schema";
import { createOrder, getOrderById, getOrderOwnerSessionId, listOrders } from "./service";

export const ordersRouter = Router();

// Kiosk checkout stub — creates a `pending` order + items in one shot.
// Payment processing (and the resulting status transition) is wired up in Sprint 3.
ordersRouter.post("/", authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const order = await createOrder({ ...body, kioskSessionId: req.kioskSessionId });
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

// Staff/admin order oversight — currently used by /staff/orders to find counter
// payments awaiting confirmation. Full filtering/pagination is Sprint 5 scope.
ordersRouter.get("/", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const orders = await listOrders({ unpaidCounterOnly: req.query.unpaid === "1" });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

/**
 * Anonymous kiosk sessions may only fetch their own order — without this, any valid
 * kiosk-session token could pull up any order by guessing/observing its UUID (e.g. one
 * left in browser history on the shared kiosk terminal). Staff/admin retain full
 * oversight access. 404 (not 403) on a mismatch, so a non-owner can't even confirm the
 * id refers to a real order.
 */
async function assertOrderAccess(req: AuthenticatedRequest, orderId: string) {
  if (req.user?.role !== "customer") return; // staff/admin: unrestricted
  const ownerSessionId = await getOrderOwnerSessionId(orderId);
  if (ownerSessionId !== req.kioskSessionId) throw new HttpError(404, "Order not found");
}

ordersRouter.get("/:id", authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) throw new HttpError(404, "Order not found");
    await assertOrderAccess(req, req.params.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// Alias of GET /:id, named per the receipt use case (order confirmation screen).
ordersRouter.get("/:id/receipt", authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) throw new HttpError(404, "Order not found");
    await assertOrderAccess(req, req.params.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// Staff/admin order-correction endpoints (e.g. fixing a miskeyed qty before the
// order is confirmed/paid). The kiosk itself manages the cart client-side and only
// calls POST / at checkout, so these aren't used by the customer-facing flow.
ordersRouter.patch("/:id/items/:itemId", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    await assertOrderIsPending(req.params.id);
    const qty = parseQty(req.body?.qty);
    const item = await prisma.orderItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.orderId !== req.params.id) throw new HttpError(404, "Order item not found");

    const subtotal = item.unitPrice.mul(qty);
    const updated = await prisma.orderItem.update({
      where: { id: item.id },
      data: { qty, subtotal },
    });
    await recomputeOrderTotal(req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

ordersRouter.delete("/:id/items/:itemId", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    await assertOrderIsPending(req.params.id);
    const item = await prisma.orderItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.orderId !== req.params.id) throw new HttpError(404, "Order item not found");

    await prisma.orderItem.delete({ where: { id: item.id } });
    await recomputeOrderTotal(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * Item edits/deletes were only ever meant for correcting a still-pending order (per
 * the comment above) — nothing enforced that. Editing/deleting items on an already
 * confirmed/paid order left payment.amount out of sync with the recomputed total, and
 * deleting cascaded away the kitchen task without returning stock that had already
 * been deducted. Enforcing "pending only" here removes the need to handle either of
 * those downstream cases: past this point in an order's lifecycle, its items are
 * locked in.
 */
async function assertOrderIsPending(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status !== "pending") {
    throw new HttpError(409, "Only pending orders can have their items edited — this order is already confirmed");
  }
}

function parseQty(value: unknown): number {
  const qty = Number(value);
  if (!Number.isInteger(qty) || qty <= 0 || qty > 999) throw new HttpError(400, "qty must be a positive integer (max 999)");
  return qty;
}

async function recomputeOrderTotal(orderId: string) {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  const total = items.reduce((sum, i) => sum.add(i.subtotal), new Prisma.Decimal(0));
  await prisma.order.update({ where: { id: orderId }, data: { totalAmount: total } });
}
