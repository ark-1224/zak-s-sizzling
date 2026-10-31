import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { emitOrdersChanged, getIO } from "../../websocket";
import { HttpError } from "../../middleware/errorHandler";
import { setEstimateOnReachingKitchen } from "../orders/prepTime";
import { BOARD_WINDOW_MS } from "../orders/service";
import type { KitchenTaskDTO } from "@zaks/shared-types";

type TaskWithRelations = Prisma.KitchenTaskGetPayload<{
  include: { orderItem: { include: { product: true; order: true } } };
}>;

function toTaskDTO(task: TaskWithRelations): KitchenTaskDTO {
  return {
    id: task.id,
    orderId: task.orderItem.orderId,
    orderNumber: task.orderItem.order.orderNumber,
    orderCreatedAt: task.orderItem.order.createdAt.toISOString(),
    orderEstimatedReadyAt: task.orderItem.order.estimatedReadyAt?.toISOString() ?? null,
    orderType: task.orderItem.order.orderType,
    orderStatus: task.orderItem.order.status,
    productId: task.orderItem.productId,
    productName: task.orderItem.product.name,
    productIcon: task.orderItem.product.icon,
    qty: task.orderItem.qty,
    specialInstructions: task.orderItem.specialInstructions,
    status: task.status,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}

/** Called once an order is paid — creates one KitchenTask per line item and puts the
 *  order on the kitchen's radar. Orders that are only `pending` (unpaid) never reach
 *  the kitchen, matching the manuscript's payment-before-prep flow. */
export async function createKitchenTasksForOrder(orderId: string): Promise<void> {
  // The estimate is set once, when the order first reaches the kitchen, so running this
  // twice doesn't move the ready time.
  const current = await prisma.order.findUnique({ where: { id: orderId }, select: { estimatedReadyAt: true } });
  if (current && !current.estimatedReadyAt) await setEstimateOnReachingKitchen(orderId);

  const items = await prisma.orderItem.findMany({ where: { orderId } });
  await prisma.kitchenTask.createMany({
    data: items.map((item) => ({ orderItemId: item.id })),
    skipDuplicates: true, // idempotent if this ever runs twice for the same order
  });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (order) getIO()?.emit("order:created", { orderId: order.id, orderNumber: order.orderNumber });
}

/**
 * The kitchen display's queue: every unfinished dish, plus the dishes of orders that are
 * ready and waiting to be handed over, so a finished order stays on screen as READY until
 * the kitchen presses Handed over.
 */
export async function listActiveTasks(): Promise<KitchenTaskDTO[]> {
  const tasks = await prisma.kitchenTask.findMany({
    where: {
      OR: [
        { status: { not: "completed" } },
        // Ready orders leave with the counter board's window, even if never handed over.
        { orderItem: { order: { status: "ready", createdAt: { gte: new Date(Date.now() - BOARD_WINDOW_MS) } } } },
      ],
    },
    include: { orderItem: { include: { product: true, order: true } } },
    orderBy: { createdAt: "asc" },
  });
  return tasks.map(toTaskDTO);
}

export async function updateTaskStatus(
  taskId: string,
  status: "pending" | "in_progress" | "completed"
): Promise<KitchenTaskDTO> {
  const existing = await prisma.kitchenTask.findUnique({
    where: { id: taskId },
    include: { orderItem: { select: { order: { select: { orderNumber: true, status: true } } } } },
  });
  if (!existing) throw new HttpError(404, "Kitchen task not found");
  const order = existing.orderItem.order;
  if (order.status === "completed") throw new HttpError(409, `${order.orderNumber} was already handed over`);

  const task = await prisma.kitchenTask.update({
    where: { id: taskId },
    data: {
      status,
      startedAt: status === "in_progress" && !existing.startedAt ? new Date() : undefined,
      completedAt: status === "completed" ? new Date() : null,
    },
    include: { orderItem: { include: { product: true, order: true } } },
  });

  getIO()?.emit("kitchen:task_updated", { taskId: task.id, orderId: task.orderItem.orderId, status: task.status });
  await syncOrderStatus(task.orderItem.orderId);
  return toTaskDTO(task);
}

/**
 * The order's status follows its dishes: preparing once any dish is started, ready once
 * every dish is done (confirmed again if every dish went back to pending). Only orders in
 * the kitchen change: never an unpaid, handed-over or cancelled one.
 */
async function syncOrderStatus(orderId: string) {
  const tasks = await prisma.kitchenTask.findMany({ where: { orderItem: { orderId } }, select: { status: true } });
  if (tasks.length === 0) return;
  const next = tasks.every((t) => t.status === "completed")
    ? "ready"
    : tasks.some((t) => t.status !== "pending")
      ? "preparing"
      : "confirmed";
  const result = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ["confirmed", "preparing", "ready"], not: next } },
    data: { status: next },
  });
  if (result.count > 0) emitOrdersChanged();
}

/**
 * The kitchen hands a ready order to the customer: ready → completed, and it leaves the
 * kitchen display and the status board. One conditional update, so pressing it twice
 * (or on an order that isn't ready) changes nothing and says why.
 */
export async function handOverOrder(orderId: string): Promise<void> {
  const result = await prisma.order.updateMany({
    where: { id: orderId, status: "ready" },
    data: { status: "completed", handedOverAt: new Date() },
  });
  if (result.count === 0) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, status: true } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status === "completed") throw new HttpError(409, `${order.orderNumber} was already handed over`);
    throw new HttpError(409, `${order.orderNumber} isn't ready yet; finish every dish first`);
  }
  emitOrdersChanged();
}
