import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getIO } from "../../websocket";
import { HttpError } from "../../middleware/errorHandler";
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
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  await prisma.kitchenTask.createMany({
    data: items.map((item) => ({ orderItemId: item.id })),
    skipDuplicates: true, // idempotent if this ever runs twice for the same order
  });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (order) getIO()?.emit("order:created", { orderId: order.id, orderNumber: order.orderNumber });
}

export async function listActiveTasks(): Promise<KitchenTaskDTO[]> {
  const tasks = await prisma.kitchenTask.findMany({
    where: { status: { not: "completed" } },
    include: { orderItem: { include: { product: true, order: true } } },
    orderBy: { createdAt: "asc" },
  });
  return tasks.map(toTaskDTO);
}

export async function updateTaskStatus(
  taskId: string,
  status: "pending" | "in_progress" | "completed"
): Promise<KitchenTaskDTO> {
  const existing = await prisma.kitchenTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new HttpError(404, "Kitchen task not found");

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
  return toTaskDTO(task);
}
