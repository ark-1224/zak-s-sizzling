import { Prisma } from "@prisma/client";
import type { OrderDTO } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { emitOrdersChanged } from "../../websocket";
import { refreshAvailability, returnStockForLines } from "../inventory/fulfillment";
import { cancelKitchenOrder, syncOrderStatus } from "../kitchen/service";
import { addAttentionNote, lockOrder } from "../payments/attentionNote";
import { cancelOrder, getOrderById } from "./service";

// Cancelling some dishes of an order, on Orders awaiting payment (panel feedback):
// - Unpaid, in the Queue: the dishes come off the order and the total goes down before the
//   customer pays. Nothing was deducted or sent to the kitchen, so nothing goes back.
// - Paid, in the kitchen: the same rules as cancelling the whole paid order. A dish the
//   kitchen hasn't started goes back into stock; a started or finished one counts as used.
//   The total goes down, and the order goes to the Queue as NEEDS ATTENTION with the
//   amount to refund; the rest of the order stays in the kitchen.
// Cancelling everything that is left cancels the whole order, as Cancel order always did.
// On a paid order a line keeps what was cancelled in cancelledQty (it was deducted at
// payment, so the stock movements log can show the sale and its return); a paid line
// cancelled whole stays with qty 0 and leaves the kitchen display.

export interface CancelItemsInput {
  items: { itemId: string; qty: number }[];
  reason?: string;
}

const IN_KITCHEN = ["confirmed", "preparing", "ready"] as const;
const PAID_BY: Record<string, string> = { counter: "paid in cash", gcash: "paid by GCash", maya: "paid by Maya", qrph: "paid online" };

const peso = (amount: Prisma.Decimal) => `₱${amount.toFixed(2)}`;

export async function cancelOrderItems(orderId: string, input: CancelItemsInput, userId: string): Promise<OrderDTO> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, orderNumber: true, items: { select: { id: true, qty: true } }, payment: { select: { status: true } } },
  });
  if (!order) throw new HttpError(404, "Order not found");
  const paid = order.payment?.status === "paid";
  if (paid && !input.reason) throw new HttpError(400, "Say why the dishes are being cancelled");

  // Everything still ordered: that is cancelling the whole order.
  const asked = new Map(input.items.map((i) => [i.itemId, i.qty]));
  const remaining = order.items.filter((i) => i.qty > 0);
  const everything = remaining.length > 0 && remaining.every((i) => asked.get(i.id) === i.qty) && asked.size === remaining.length;
  if (everything && order.status === "pending" && !paid) return cancelOrder(orderId);
  if (everything && paid && (IN_KITCHEN as readonly string[]).includes(order.status)) {
    await cancelKitchenOrder(orderId, input.reason!, userId);
    return (await getOrderById(orderId))!;
  }

  const touched = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const current = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        payment: true,
        items: { include: { kitchenTask: true, product: { include: { recipeItems: { include: { rawMaterial: true } } } } } },
      },
    });
    assertCanChange(current);
    const isPaid = current.payment?.status === "paid";
    // Paid while staff were choosing the dishes: a paid order needs a reason and a refund.
    if (isPaid && !input.reason) throw new HttpError(409, `${current.orderNumber} was just paid. Cancel its dishes from Paid orders`);

    const lines = input.items.map(({ itemId, qty }) => {
      const line = current.items.find((i) => i.id === itemId);
      if (!line) throw new HttpError(404, "Order item not found");
      if (line.qty === 0) throw new HttpError(409, `${line.product.name} is already cancelled`);
      if (qty > line.qty) throw new HttpError(400, `Only ${line.qty} × ${line.product.name} can be cancelled`);
      return { line, qty };
    });

    let refund = new Prisma.Decimal(0);
    for (const { line, qty } of lines) {
      const left = line.qty - qty;
      refund = refund.add(line.unitPrice.mul(qty));
      if (!isPaid && left === 0) {
        await tx.orderItem.delete({ where: { id: line.id } });
        continue;
      }
      await tx.orderItem.update({
        where: { id: line.id },
        data: { qty: left, subtotal: line.unitPrice.mul(left), ...(isPaid ? { cancelledQty: { increment: qty } } : {}) },
      });
      // A dish cancelled whole leaves the kitchen display (and stops counting for the order's status).
      if (isPaid && left === 0 && line.kitchenTask) await tx.kitchenTask.delete({ where: { id: line.kitchenTask.id } });
    }
    // The order changed meanwhile so that nothing would be left: that is a whole-order cancel.
    const left = await tx.orderItem.count({ where: { orderId, qty: { gt: 0 } } });
    if (left === 0) throw new HttpError(409, `${current.orderNumber} changed meanwhile. Check it, then cancel the whole order`);
    const totalAmount = current.totalAmount.sub(refund);

    if (!isPaid) {
      await tx.order.update({ where: { id: orderId }, data: { totalAmount } });
      // The waiting payment was made for the old total; taking payment records this amount.
      await tx.payment.updateMany({ where: { orderId, status: { not: "paid" } }, data: { amount: totalAmount } });
      return null;
    }

    const what = lines.map(({ line, qty }) => `${qty} × ${line.product.name}`).join(", ");
    const note = `Dishes cancelled while in the kitchen: ${what} (${input.reason}). Refund the customer ${peso(refund)} (${PAID_BY[current.payment!.method] ?? "paid"}).`;
    await tx.order.update({
      where: { id: orderId },
      data: { totalAmount, stockIssue: true, stockIssueNote: addAttentionNote(current.stockIssueNote, current.stockIssue, note) },
    });

    // Only what the kitchen hasn't started goes back into stock.
    const unstarted = lines
      .filter(({ line }) => line.kitchenTask?.status === "pending")
      .map(({ line, qty }) => ({ qty, product: line.product }));
    return returnStockForLines(tx, unstarted, { orderId, userId, note: `Dishes of order ${current.orderNumber} cancelled while in the kitchen` });
  });

  if (touched) {
    await refreshAvailability(touched);
    // The order may be ready now, if every dish left is done.
    await syncOrderStatus(orderId);
  }
  emitOrdersChanged();
  return (await getOrderById(orderId))!;
}

type OrderForCancel = Prisma.OrderGetPayload<{ include: { payment: true } }>;

function assertCanChange(order: OrderForCancel) {
  if (order.status === "cancelled") throw new HttpError(409, `${order.orderNumber} is already cancelled`);
  if (order.status === "completed") throw new HttpError(409, `${order.orderNumber} was already handed over`);
  const paid = order.payment?.status === "paid";
  if (paid && !(IN_KITCHEN as readonly string[]).includes(order.status)) throw new HttpError(409, `${order.orderNumber} hasn't reached the kitchen`);
  // The QR Ph code on the kiosk was made for the current total.
  if (!paid && order.payment?.method === "qrph" && order.payment.reference) {
    throw new HttpError(409, `${order.orderNumber} is being paid by QR Ph, so its dishes can't be changed. Cancel the whole order instead.`);
  }
}
