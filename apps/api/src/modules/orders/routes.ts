import { Router } from "express";
import { Prisma } from "@prisma/client";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { prisma } from "../../lib/prisma";
import { createOrderSchema } from "./schema";
import { createOrder, getOrderById, listOrders } from "./service";

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

ordersRouter.get("/:id", authenticate, async (req, res, next) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) throw new HttpError(404, "Order not found");
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// Alias of GET /:id, named per the receipt use case (order confirmation screen).
ordersRouter.get("/:id/receipt", authenticate, async (req, res, next) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) throw new HttpError(404, "Order not found");
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
    const item = await prisma.orderItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.orderId !== req.params.id) throw new HttpError(404, "Order item not found");

    await prisma.orderItem.delete({ where: { id: item.id } });
    await recomputeOrderTotal(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

function parseQty(value: unknown): number {
  const qty = Number(value);
  if (!Number.isInteger(qty) || qty <= 0) throw new HttpError(400, "qty must be a positive integer");
  return qty;
}

async function recomputeOrderTotal(orderId: string) {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  const total = items.reduce((sum, i) => sum.add(i.subtotal), new Prisma.Decimal(0));
  await prisma.order.update({ where: { id: orderId }, data: { totalAmount: total } });
}
