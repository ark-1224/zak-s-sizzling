import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { refreshAvailability } from "../../src/modules/inventory/fulfillment";
import { PRODUCTS, RAW_MATERIALS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// Cancelling some dishes of an order on Orders awaiting payment (POST
// /api/orders/:id/cancel-items): before payment in the Queue the dishes come off the order;
// after payment, in Paid orders, the rules of cancelling a whole paid order apply to the
// dishes chosen (stock back for dishes not started, a refund flagged in the Queue).
// Uses Test Bottled Water (counted in pieces, ₱25) and the recipe dish Test Sisig Rice Bowl
// (₱150); their stock is put back, and this file's paid orders handed over, afterwards.

const water = PRODUCTS.water;
const bowl = PRODUCTS.riceBowl;
const materialNames = Object.values(RAW_MATERIALS).map((m) => m.name);

let customer: string;
let staff: string;
let waterBefore: number;
let materialsBefore: { name: string; stockQty: number }[];
const placedIds: string[] = [];

beforeAll(async () => {
  customer = await kioskToken();
  staff = await loginAs("staff");
  waterBefore = (await prisma.inventory.findUniqueOrThrow({ where: { productId: water.id } })).stockQty;
  const materials = await prisma.rawMaterial.findMany({ where: { name: { in: materialNames } } });
  materialsBefore = materials.map((m) => ({ name: m.name, stockQty: m.stockQty.toNumber() }));
  await prisma.inventory.update({ where: { productId: water.id }, data: { stockQty: 500 } });
  await prisma.rawMaterial.updateMany({ where: { name: { in: materialNames } }, data: { stockQty: 100_000 } });
  await refreshAvailability({ productIds: [water.id, bowl.id], materialIds: [] });
});

afterAll(async () => {
  await prisma.order.updateMany({
    where: { id: { in: placedIds }, status: { in: ["confirmed", "preparing", "ready"] } },
    data: { status: "completed", handedOverAt: new Date() },
  });
  await prisma.inventory.update({ where: { productId: water.id }, data: { stockQty: waterBefore } });
  for (const { name, stockQty } of materialsBefore) await prisma.rawMaterial.update({ where: { name }, data: { stockQty } });
  await refreshAvailability({ productIds: [water.id, bowl.id], materialIds: [] });
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const waterStock = async () => (await prisma.inventory.findUniqueOrThrow({ where: { productId: water.id } })).stockQty;
const materialStock = async (key: keyof typeof RAW_MATERIALS) =>
  (await prisma.rawMaterial.findUniqueOrThrow({ where: { name: RAW_MATERIALS[key].name } })).stockQty.toNumber();

type Line = { id: string; productId: string; qty: number; cancelledQty: number; subtotal: number };

async function unpaidOrder(items: { productId: string; qty: number }[]) {
  const placed = await request(app).post("/api/orders").set(auth(customer)).send({ items, paymentMethod: "counter" });
  expect(placed.status).toBe(201);
  placedIds.push(placed.body.id);
  const lines = placed.body.items as Line[];
  return { id: placed.body.id as string, orderNumber: placed.body.orderNumber as string, line: (productId: string) => lines.find((l) => l.productId === productId)!.id };
}

async function paidOrder(items: { productId: string; qty: number }[]) {
  const order = await unpaidOrder(items);
  expect((await request(app).post(`/api/payments/counter/${order.id}/confirm`).set(auth(staff))).status).toBe(200);
  const tasks = await prisma.kitchenTask.findMany({ where: { orderItem: { orderId: order.id } }, include: { orderItem: true } });
  return { ...order, taskOf: (productId: string) => tasks.find((t) => t.orderItem.productId === productId)!.id };
}

const cancelItems = (orderId: string, body: object) => request(app).post(`/api/orders/${orderId}/cancel-items`).set(auth(staff)).send(body);
const setTask = (taskId: string, status: string) => request(app).patch(`/api/kitchen/tasks/${taskId}`).set(auth(staff)).send({ status });
const lineOf = (body: { items: Line[] }, productId: string) => body.items.find((l) => l.productId === productId)!;

describe("cancelling some dishes before payment (Queue)", () => {
  it("lowers a line and the total, with no reason needed and nothing put back into stock", async () => {
    const order = await unpaidOrder([
      { productId: water.id, qty: 3 },
      { productId: bowl.id, qty: 1 },
    ]);
    const stock = await waterStock();

    const res = await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.totalAmount).toBe(175); // 1 water + 1 bowl
    expect(lineOf(res.body, water.id)).toMatchObject({ qty: 1, cancelledQty: 0, subtotal: 25 });
    expect(res.body.stockIssue).toBe(false);
    expect(await waterStock()).toBe(stock);
  });

  it("takes a line cancelled whole off the order, and the payment then charges the new total", async () => {
    const order = await unpaidOrder([
      { productId: water.id, qty: 2 },
      { productId: bowl.id, qty: 1 },
    ]);

    const res = await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.totalAmount).toBe(150);
    const paid = await request(app).post(`/api/payments/counter/${order.id}/confirm`).set(auth(staff));
    expect(paid.status).toBe(200);
    expect(paid.body.payment.amount).toBe(150);
    expect(await prisma.kitchenTask.count({ where: { orderItem: { orderId: order.id } } })).toBe(1);
  });

  it("keeps the waiting payment's amount with the total when staff edit a line's quantity", async () => {
    const order = await unpaidOrder([{ productId: water.id, qty: 4 }]);

    await request(app).patch(`/api/orders/${order.id}/items/${order.line(water.id)}`).set(auth(staff)).send({ qty: 1 });

    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).amount.toNumber()).toBe(25);
  });

  it("cancels the whole order when every dish left is chosen", async () => {
    const order = await unpaidOrder([{ productId: water.id, qty: 2 }]);

    const res = await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("refuses more than was ordered, a dish not on the order, the same dish twice, or nothing", async () => {
    const order = await unpaidOrder([{ productId: water.id, qty: 2 }]);
    const line = order.line(water.id);

    expect((await cancelItems(order.id, { items: [{ itemId: line, qty: 3 }] })).status).toBe(400);
    expect((await cancelItems(order.id, { items: [{ itemId: "99999999-9999-4999-8999-999999999999", qty: 1 }] })).status).toBe(404);
    expect((await cancelItems(order.id, { items: [{ itemId: line, qty: 1 }, { itemId: line, qty: 1 }] })).status).toBe(400);
    expect((await cancelItems(order.id, { items: [] })).status).toBe(400);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: line } })).qty).toBe(2);
  });

  it("refuses an order whose QR Ph payment has started, since the code was made for its total", async () => {
    const order = await unpaidOrder([
      { productId: water.id, qty: 2 },
      { productId: bowl.id, qty: 1 },
    ]);
    await prisma.payment.update({ where: { orderId: order.id }, data: { method: "qrph", reference: `cancel-items-${order.id}` } });

    const res = await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("QR Ph");
  });
});

describe("cancelling some dishes of a paid order (Paid orders)", () => {
  it("needs a reason", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 2 }]);

    const res = await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 1 }] });

    expect(res.status).toBe(400);
  });

  it("returns the stock of a dish not started, lowers the total and flags the refund, keeping the order in the kitchen", async () => {
    const order = await paidOrder([
      { productId: water.id, qty: 2 },
      { productId: bowl.id, qty: 1 },
    ]);
    const stock = await waterStock();

    const res = await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 1 }], reason: "Customer changed their mind" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.totalAmount).toBe(175);
    expect(res.body.payment).toMatchObject({ status: "paid", amount: 200 });
    expect(lineOf(res.body, water.id)).toMatchObject({ qty: 1, cancelledQty: 1, subtotal: 25 });
    expect(res.body.stockIssue).toBe(true);
    expect(res.body.stockIssueNote).toContain("1 × Test Bottled Water (Customer changed their mind)");
    expect(res.body.stockIssueNote).toContain("Refund the customer ₱25.00 (paid in cash)");
    expect(await waterStock()).toBe(stock + 1);
    const adjustment = await prisma.stockAdjustment.findFirstOrThrow({ where: { productId: water.id, note: { contains: order.orderNumber } } });
    expect(adjustment).toMatchObject({ delta: 1, reason: "return" });
    // It is in the Queue for the refund, and still in the kitchen with what is left.
    const queue = (await request(app).get("/api/orders?unpaid=1").set(auth(staff))).body as { id: string }[];
    expect(queue.some((o) => o.id === order.id)).toBe(true);
    const tasks = (await request(app).get("/api/kitchen/tasks").set(auth(staff))).body as { orderId: string; productName: string; qty: number }[];
    expect(tasks.filter((t) => t.orderId === order.id).map((t) => [t.productName, t.qty]).sort()).toEqual([
      ["Test Bottled Water", 1],
      ["Test Sisig Rice Bowl", 1],
    ]);
  });

  it("counts a started dish as used, takes it off the kitchen display, and the order is ready once the rest is done", async () => {
    const order = await paidOrder([
      { productId: water.id, qty: 1 },
      { productId: bowl.id, qty: 1 },
    ]);
    await setTask(order.taskOf(bowl.id), "in_progress");
    await setTask(order.taskOf(water.id), "completed");
    const before = { pork: await materialStock("pork"), rice: await materialStock("rice") };

    const res = await cancelItems(order.id, { items: [{ itemId: order.line(bowl.id), qty: 1 }], reason: "Dropped the plate" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(lineOf(res.body, bowl.id)).toMatchObject({ qty: 0, cancelledQty: 1, subtotal: 0 });
    expect(res.body.stockIssueNote).toContain("Refund the customer ₱150.00");
    expect(await materialStock("pork")).toBe(before.pork);
    expect(await materialStock("rice")).toBe(before.rice);
    const tasks = (await request(app).get("/api/kitchen/tasks").set(auth(staff))).body as { orderId: string; productName: string }[];
    expect(tasks.filter((t) => t.orderId === order.id).map((t) => t.productName)).toEqual(["Test Bottled Water"]);
  });

  it("cancels the whole order when every dish left is chosen, as Cancel order did", async () => {
    const order = await paidOrder([
      { productId: water.id, qty: 2 },
      { productId: bowl.id, qty: 1 },
    ]);
    await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 1 }], reason: "Customer left" });

    const res = await cancelItems(order.id, {
      items: [
        { itemId: order.line(water.id), qty: 1 },
        { itemId: order.line(bowl.id), qty: 1 },
      ],
      reason: "Customer left",
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    expect(res.body.cancelReason).toBe("Customer left");
    // Both notes stay, so both refunds are on screen: ₱25 first, then the ₱175 left.
    expect(res.body.stockIssueNote).toContain("Refund the customer ₱25.00");
    expect(res.body.stockIssueNote).toContain("Refund the customer ₱175.00");
  });

  it("leaves the payment as paid when the partial refund is marked as sorted out", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 2 }]);
    const cancelled = await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 1 }], reason: "Customer left" });

    const res = await request(app).post(`/api/orders/${order.id}/sorted-out`).set(auth(staff)).send({ note: cancelled.body.stockIssueNote });

    expect(res.status).toBe(200);
    expect(res.body.stockIssue).toBe(false);
    expect(res.body.payment.status).toBe("paid");
  });

  it("refuses a dish already cancelled, and an order already handed over", async () => {
    const order = await paidOrder([
      { productId: water.id, qty: 1 },
      { productId: bowl.id, qty: 1 },
    ]);
    await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 1 }], reason: "Customer left" });

    const again = await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 1 }], reason: "Customer left" });
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("already cancelled");

    await setTask(order.taskOf(bowl.id), "completed");
    await request(app).post(`/api/kitchen/orders/${order.id}/handed-over`).set(auth(staff));
    const late = await cancelItems(order.id, { items: [{ itemId: order.line(bowl.id), qty: 1 }], reason: "Customer left" });
    expect(late.status).toBe(409);
    expect(late.body.error).toContain("already handed over");
  });

  it("shows the sale of what was paid for and the return of what was cancelled in Stock movements", async () => {
    const order = await paidOrder([
      { productId: water.id, qty: 3 },
      { productId: bowl.id, qty: 1 },
    ]);
    await cancelItems(order.id, { items: [{ itemId: order.line(water.id), qty: 2 }], reason: "Customer left" });

    const res = await request(app).get(`/api/inventory/movements?itemId=${water.id}`).set(auth(staff));

    const sale = (res.body as { type: string; orderNumber: string | null; delta: number; note: string | null }[]).find(
      (m) => m.type === "sale" && m.orderNumber === order.orderNumber
    );
    const back = (res.body as { type: string; delta: number; note: string | null }[]).find((m) => m.type === "adjustment" && m.note?.includes(order.orderNumber));
    expect(sale?.delta).toBe(-3);
    expect(back?.delta).toBe(2);
  });
});
