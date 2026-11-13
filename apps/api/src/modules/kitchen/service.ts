import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { emitOrdersChanged, getIO } from "../../websocket";
import { HttpError } from "../../middleware/errorHandler";
import { refreshAvailability, returnStockForLines } from "../inventory/fulfillment";
import { setEstimateOnReachingKitchen } from "../orders/prepTime";
import { BOARD_WINDOW_MS } from "../orders/service";
import { addAttentionNote, lockOrder } from "../payments/attentionNote";
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

/** Called in the transaction that records an order's payment, so a paid order always has
 *  its tasks: creates one KitchenTask per line item and sets when it should be ready.
 *  Orders that are only `pending` (unpaid) never reach the kitchen, matching the
 *  manuscript's payment-before-prep flow. The caller announces it once committed. */
export async function createKitchenTasksForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await setEstimateOnReachingKitchen(orderId, tx);
  const items = await tx.orderItem.findMany({ where: { orderId } });
  await tx.kitchenTask.createMany({ data: items.map((item) => ({ orderItemId: item.id })) });
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
        { status: { not: "completed" }, orderItem: { order: { status: { not: "cancelled" } } } },
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
  if (order.status === "cancelled") throw new HttpError(409, `${order.orderNumber} was cancelled`);

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

/**
 * Staff cancel a paid order (on Orders awaiting payment > Paid orders) at any point before
 * the kitchen hands it over. Dishes nobody
 * has started go back into stock; a dish already started or done counts as used. The
 * system can't send the money back, so the order goes to the payment queue as NEEDS
 * ATTENTION until staff have refunded the customer. All or nothing, and the status is one
 * conditional update, so cancelling twice or racing Handed over changes nothing and says why.
 */
export async function cancelKitchenOrder(orderId: string, reason: string, userId: string): Promise<void> {
  const touched = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, status: true, totalAmount: true, stockIssue: true, stockIssueNote: true, payment: { select: { method: true } } },
    });
    if (!order) throw new HttpError(404, "Order not found");

    const paidBy = { counter: "paid in cash", gcash: "paid by GCash", maya: "paid by Maya", qrph: "paid online" }[order.payment?.method ?? "counter"];
    const refundNote = `Cancelled while in the kitchen: ${reason}. Refund the customer ₱${Number(order.totalAmount).toFixed(2)} (${paidBy}).`;
    const result = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["confirmed", "preparing", "ready"] } },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: reason,
        stockIssue: true,
        stockIssueNote: addAttentionNote(order.stockIssueNote, order.stockIssue, refundNote),
      },
    });
    if (result.count === 0) {
      if (order.status === "completed") throw new HttpError(409, `${order.orderNumber} was already handed over`);
      if (order.status === "cancelled") throw new HttpError(409, `${order.orderNumber} is already cancelled`);
      throw new HttpError(409, `${order.orderNumber} hasn't reached the kitchen`);
    }

    const unstarted = await tx.orderItem.findMany({
      where: { orderId, kitchenTask: { status: "pending" } },
      include: { product: { include: { recipeItems: { include: { rawMaterial: true } } } } },
    });
    return returnStockForLines(tx, unstarted, { orderId, userId, note: `Order ${order.orderNumber} cancelled while in the kitchen` });
  });

  await refreshAvailability(touched);
  emitOrdersChanged();
}
