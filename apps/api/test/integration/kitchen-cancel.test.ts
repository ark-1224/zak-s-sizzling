import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { refreshAvailability } from "../../src/modules/inventory/fulfillment";
import { PRODUCTS, RAW_MATERIALS, USERS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// The kitchen cancels a paid order from the kitchen display: dishes nobody started go
// back into stock, a started dish counts as used, and the order goes to the payment
// queue for a refund. Uses Test Bottled Water (counted in units) and the recipe dish
// Test Sisig Rice Bowl; the raw materials' stock is put back after this file.

const water = PRODUCTS.water;
const bowl = PRODUCTS.riceBowl;

let customer: string;
let staff: string;
let materialsBefore: { name: string; stockQty: number }[];

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const materialNames = Object.values(RAW_MATERIALS).map((m) => m.name);
const waterStock = async () => (await prisma.inventory.findUniqueOrThrow({ where: { productId: water.id } })).stockQty;
const materialStock = async (key: keyof typeof RAW_MATERIALS) =>
  (await prisma.rawMaterial.findUniqueOrThrow({ where: { name: RAW_MATERIALS[key].name } })).stockQty.toNumber();

beforeAll(async () => {
  customer = await kioskToken();
  staff = await loginAs("staff");
  const materials = await prisma.rawMaterial.findMany({ where: { name: { in: materialNames } } });
  materialsBefore = materials.map((m) => ({ name: m.name, stockQty: m.stockQty.toNumber() }));
  await prisma.rawMaterial.updateMany({ where: { name: { in: materialNames } }, data: { stockQty: 10_000 } });
  // An earlier file may have left the bowl sold out (stock.test.ts ends with too little
  // rice); with the raw materials restocked, work out its availability again.
  await refreshAvailability({ productIds: [water.id, bowl.id], materialIds: [] });
});

afterAll(async () => {
  for (const { name, stockQty } of materialsBefore) await prisma.rawMaterial.update({ where: { name }, data: { stockQty } });
});

/** An order paid at the counter, now in the kitchen, with one task per line. */
async function paidOrder(items: { productId: string; qty: number }[]) {
  const placed = await request(app).post("/api/orders").set(auth(customer)).send({ items, paymentMethod: "counter" });
  expect(placed.status).toBe(201);
  const confirm = await request(app).post(`/api/payments/counter/${placed.body.id}/confirm`).set(auth(staff));
  expect(confirm.status).toBe(200);
  const tasks = await prisma.kitchenTask.findMany({ where: { orderItem: { orderId: placed.body.id } }, include: { orderItem: true } });
  const taskOf = (productId: string) => tasks.find((t) => t.orderItem.productId === productId)!.id;
  return { id: placed.body.id as string, orderNumber: placed.body.orderNumber as string, totalAmount: placed.body.totalAmount as number, taskOf };
}

const cancel = (orderId: string, reason: unknown = "Customer left") =>
  request(app).post(`/api/kitchen/orders/${orderId}/cancel`).set(auth(staff)).send({ reason });
const setTask = (taskId: string, status: string) => request(app).patch(`/api/kitchen/tasks/${taskId}`).set(auth(staff)).send({ status });
/** Marks an order as sorted out, having read the note it has now. */
const sortOut = async (orderId: string, resolution: string | undefined = "refunded") => {
  const { stockIssueNote: note } = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return request(app).post(`/api/orders/${orderId}/sorted-out`).set(auth(staff)).send({ note, resolution });
};
const kitchenQueue = async () => (await request(app).get("/api/kitchen/tasks").set(auth(staff))).body as { orderId: string }[];

describe("cancelling an order nobody has started", () => {
  it("returns all its stock, with a logged movement under the person who cancelled", async () => {
    const before = { water: await waterStock(), pork: await materialStock("pork"), rice: await materialStock("rice") };
    const order = await paidOrder([
      { productId: water.id, qty: 2 },
      { productId: bowl.id, qty: 1 },
    ]);
    expect(await waterStock()).toBe(before.water - 2);

    const res = await cancel(order.id);

    expect(res.status).toBe(204);
    expect(await waterStock()).toBe(before.water);
    expect(await materialStock("pork")).toBe(before.pork);
    expect(await materialStock("rice")).toBe(before.rice);

    const staffUser = await prisma.user.findUniqueOrThrow({ where: { email: USERS.staff.email } });
    const adjustment = await prisma.stockAdjustment.findFirstOrThrow({ where: { productId: water.id, note: { contains: order.orderNumber } } });
    expect(adjustment).toMatchObject({ delta: 2, reason: "return", adjustedById: staffUser.id });
    const movements = await prisma.rawMaterialMovement.findMany({ where: { orderId: order.id, type: "adjustment" } });
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.reason === "return" && m.adjustedById === staffUser.id)).toBe(true);
  });

  it("records the reason and time, and sends the order to the payment queue for a refund", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);

    await cancel(order.id, "  Ran out of an ingredient  ");

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    expect(saved).toMatchObject({ status: "cancelled", cancelReason: "Ran out of an ingredient", stockIssue: true });
    expect(saved.cancelledAt).not.toBeNull();
    expect(saved.payment?.status).toBe("paid");
    expect(saved.stockIssueNote).toContain("Cancelled while in the kitchen: Ran out of an ingredient");
    expect(saved.stockIssueNote).toContain(`Refund the customer ₱${order.totalAmount.toFixed(2)} (paid in cash)`);

    const queue = await request(app).get("/api/orders?unpaid=1").set(auth(staff));
    expect(queue.body.find((o: { id: string }) => o.id === order.id)).toMatchObject({
      status: "cancelled",
      stockIssue: true,
      cancelReason: "Ran out of an ingredient",
    });
  });

  it("takes it off the kitchen display and the status board, and out of the kitchen's order count", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    expect((await kitchenQueue()).some((t) => t.orderId === order.id)).toBe(true);
    const ahead = async () =>
      (await request(app).post("/api/orders/estimate").set(auth(customer)).send({ items: [{ productId: water.id, qty: 1 }] })).body.ordersAhead as number;
    const aheadBefore = await ahead();

    await cancel(order.id);

    expect((await kitchenQueue()).some((t) => t.orderId === order.id)).toBe(false);
    const board = (await request(app).get("/api/orders/board")).body as { preparing: string[]; ready: string[] };
    expect(board.preparing).not.toContain(order.orderNumber);
    expect(await ahead()).toBe(aheadBefore - 1);
  });
});

describe("cancelling an order the kitchen has started", () => {
  it("returns only the dishes nobody started", async () => {
    const before = { water: await waterStock(), pork: await materialStock("pork") };
    const order = await paidOrder([
      { productId: water.id, qty: 3 },
      { productId: bowl.id, qty: 1 },
    ]);
    await setTask(order.taskOf(bowl.id), "in_progress");

    await cancel(order.id);

    expect(await waterStock()).toBe(before.water); // not started: back in stock
    expect(await materialStock("pork")).toBe(before.pork - 150); // started: used
  });

  it("works on a ready order, and returns nothing since every dish was made", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    await setTask(order.taskOf(water.id), "completed");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("ready");
    const before = await waterStock();

    expect((await cancel(order.id)).status).toBe(204);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("cancelled");
    expect(await waterStock()).toBe(before);
    expect((await kitchenQueue()).some((t) => t.orderId === order.id)).toBe(false);
  });
});

describe("what can't be cancelled from the kitchen", () => {
  it("needs a reason", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    const before = await waterStock();

    for (const reason of ["", "   ", null, "x".repeat(201)]) {
      expect((await cancel(order.id, reason)).status).toBe(400);
    }

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("confirmed");
    expect(await waterStock()).toBe(before);
  });

  it("refuses a second cancel, and returns the stock only once", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 2 }]);
    await cancel(order.id);
    const before = await waterStock();

    const res = await cancel(order.id);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already cancelled/);
    expect(await waterStock()).toBe(before);
  });

  it("refuses an order already handed over", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    await setTask(order.taskOf(water.id), "completed");
    await request(app).post(`/api/kitchen/orders/${order.id}/handed-over`).set(auth(staff));

    const res = await cancel(order.id);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already handed over/);
  });

  it("refuses an unpaid order, which hasn't reached the kitchen", async () => {
    const placed = await request(app).post("/api/orders").set(auth(customer)).send({ items: [{ productId: water.id, qty: 1 }], paymentMethod: "counter" });

    const res = await cancel(placed.body.id);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/hasn't reached the kitchen/);
  });

  it("answers 404 for an order that doesn't exist", async () => {
    expect((await cancel("99999999-9999-4999-8999-999999999999")).status).toBe(404);
  });

  it("doesn't let a dish of a cancelled order change", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    await cancel(order.id);

    const res = await setTask(order.taskOf(water.id), "in_progress");

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/was cancelled/);
  });
});

describe("after the refund", () => {
  it("must say the customer was refunded, and can't be marked as placed again", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    await cancel(order.id);
    const { stockIssueNote: note } = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const post = (body: object) => request(app).post(`/api/orders/${order.id}/sorted-out`).set(auth(staff)).send(body);

    expect((await post({ note })).status).toBe(400);
    const placedAgain = await post({ note, resolution: "placed_again" });
    expect(placedAgain.status).toBe(409);
    expect(placedAgain.body.error).toMatch(/can't be marked as placed again/);

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    expect(saved.stockIssue).toBe(true);
    expect(saved.payment?.status).toBe("paid");
  });

  it("refuses a click on a note that has changed, and records nothing", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    await cancel(order.id);

    const res = await request(app).post(`/api/orders/${order.id}/sorted-out`).set(auth(staff)).send({ note: "An older note", resolution: "refunded" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/has a new note/);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    expect(saved.stockIssue).toBe(true);
    expect(saved.payment?.status).toBe("paid");
  });

  it("needs to say which note it read", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    await cancel(order.id);

    expect((await request(app).post(`/api/orders/${order.id}/sorted-out`).set(auth(staff)).send({ resolution: "refunded" })).status).toBe(400);
  });

  it("leaves the payment queue once marked as sorted out, keeping the reason", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    await cancel(order.id);

    const res = await sortOut(order.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "cancelled", stockIssue: false, cancelReason: "Customer left" });
    const queue = await request(app).get("/api/orders?unpaid=1").set(auth(staff));
    expect(queue.body.some((o: { id: string }) => o.id === order.id)).toBe(false);
  });

  it("records the payment as refunded, with when, and shows it in the transaction history", async () => {
    const order = await paidOrder([{ productId: water.id, qty: 1 }]);
    await cancel(order.id);
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("paid"); // not refunded yet

    const res = await sortOut(order.id);

    expect(res.body.payment.status).toBe("refunded");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payment.refundedAt).not.toBeNull();

    const admin = await loginAs("admin");
    const history = async (extra = "") =>
      (await request(app).get(`/api/orders/history?q=${order.orderNumber}${extra}`).set(auth(admin))).body;
    const listed = (await history()).orders[0];
    expect(listed.payment.status).toBe("refunded");
    expect(listed.timeline.refundedAt).toEqual(payment.refundedAt!.toISOString());
    // Paid once and refunded: neither still owed nor counted in sales.
    expect((await history("&paid=unpaid")).total).toBe(0);
    expect((await history()).sales).toBe(0);
  });
});
