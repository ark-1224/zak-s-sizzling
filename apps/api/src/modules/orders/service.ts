import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import type { OrderDTO } from "@zaks/shared-types";

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { items: { include: { product: true } }; payment: true };
}>;

export function toOrderDTO(order: OrderWithRelations): OrderDTO {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: Number(order.totalAmount),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      productIcon: item.product.icon,
      qty: item.qty,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      specialInstructions: item.specialInstructions,
    })),
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
          amount: Number(order.payment.amount),
          reference: order.payment.reference,
          paidAt: order.payment.paidAt?.toISOString() ?? null,
        }
      : null,
  };
}

interface CreateOrderInput {
  items: { productId: string; qty: number; specialInstructions?: string }[];
  customerName?: string;
  kioskSessionId?: string;
  paymentMethod?: "gcash" | "maya" | "counter";
}

const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function generateOrderNumber(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  return `ZK-${code}`;
}

export async function createOrder(input: CreateOrderInput) {
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { inventory: true },
  });

  const productById = new Map(products.map((p) => [p.id, p]));
  for (const item of input.items) {
    const product = productById.get(item.productId);
    if (!product) throw new HttpError(404, `Product ${item.productId} not found`);
    if (!product.isAvailable) throw new HttpError(409, `${product.name} is currently unavailable`);
    // isAvailable only means "more than zero in stock" — it doesn't guarantee enough
    // units for THIS order. The actual deduction at payment time (applyStockChange)
    // is what atomically enforces this against true concurrent orders; this check is
    // the up-front rejection so a customer doesn't get through checkout for something
    // that was never going to be fulfillable.
    if (product.inventory && product.inventory.stockQty < item.qty) {
      throw new HttpError(409, `Only ${product.inventory.stockQty} of ${product.name} left in stock`);
    }
  }

  const lines = input.items.map((item) => {
    const product = productById.get(item.productId)!;
    const unitPrice = product.price;
    const subtotal = unitPrice.mul(item.qty);
    return {
      productId: item.productId,
      qty: item.qty,
      unitPrice,
      subtotal,
      specialInstructions: item.specialInstructions,
    };
  });

  const totalAmount = lines.reduce((sum, l) => sum.add(l.subtotal), new Prisma.Decimal(0));

  // Order numbers are short and random — retry a few times on the rare collision
  // rather than serializing order creation behind a counter.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerName: input.customerName,
          kioskSessionId: input.kioskSessionId,
          totalAmount,
          items: { create: lines },
          // Recording the intended method as a `pending` payment as soon as the order
          // exists (rather than only once it's paid) means the receipt screen and the
          // staff orders queue always have a payment record to read from — never null.
          payment: input.paymentMethod
            ? { create: { method: input.paymentMethod, status: "pending", amount: totalAmount } }
            : undefined,
        },
        include: { items: { include: { product: true } }, payment: true },
      });
      return toOrderDTO(order);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new HttpError(500, "Could not generate a unique order number, please retry");
}

export async function getOrderById(id: string): Promise<OrderDTO | null> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, payment: true },
  });
  return order ? toOrderDTO(order) : null;
}

/**
 * kioskSessionId isn't part of OrderDTO (no reason to expose it to every caller), so
 * route handlers that need to check order ownership for an anonymous kiosk session
 * ask for it separately rather than it leaking into the public response shape.
 */
export async function getOrderOwnerSessionId(id: string): Promise<string | null | undefined> {
  const order = await prisma.order.findUnique({ where: { id }, select: { kioskSessionId: true } });
  return order?.kioskSessionId;
}

/** Staff/admin order oversight — e.g. the counter-payment queue on /staff/orders. */
export async function listOrders(filter: { unpaidCounterOnly?: boolean } = {}): Promise<OrderDTO[]> {
  const orders = await prisma.order.findMany({
    where: filter.unpaidCounterOnly
      ? { OR: [{ payment: null }, { payment: { status: { not: "paid" } } }] }
      : undefined,
    include: { items: { include: { product: true } }, payment: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return orders.map(toOrderDTO);
}
