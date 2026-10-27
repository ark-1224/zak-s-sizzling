import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// Order status progression: a paid order is confirmed, becomes preparing when the
// kitchen starts a dish, ready when every dish is done, and completed when the kitchen
// presses Handed over. The public status board on the counter screen lists preparing
// and ready orders by number only.

const coffee = PRODUCTS.coffee;
let customer: string;
let staff: string;

beforeAll(async () => {
  customer = await kioskToken();
  staff = await loginAs("staff");
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const statusOf = async (orderId: string) => (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;
const board = async () => (await request(app).get("/api/orders/board")).body as { preparing: string[]; ready: string[] };

/** A paid order with two dishes, so it has two kitchen tasks. */
async function paidOrder() {
  const placed = await request(app)
    .post("/api/orders")
    .set(auth(customer))
    .send({
      items: [
        { productId: coffee.id, qty: 1 },
        { productId: coffee.id, qty: 1, specialInstructions: "No sugar" },
      ],
      paymentMethod: "counter",
    });
  expect(placed.status).toBe(201);
  const confirm = await request(app).post(`/api/payments/counter/${placed.body.id}/confirm`).set(auth(staff));
  expect(confirm.status).toBe(200);
  const tasks = await prisma.kitchenTask.findMany({ where: { orderItem: { orderId: placed.body.id } }, orderBy: { createdAt: "asc" } });
  expect(tasks).toHaveLength(2);
  return { id: placed.body.id as string, orderNumber: placed.body.orderNumber as string, taskIds: tasks.map((t) => t.id) };
}

const setTask = (taskId: string, status: string) =>
  request(app).patch(`/api/kitchen/tasks/${taskId}`).set(auth(staff)).send({ status });
const handOver = (orderId: string) => request(app).post(`/api/kitchen/orders/${orderId}/handed-over`).set(auth(staff));

describe("order status follows the kitchen", () => {
  it("goes confirmed → preparing → ready → completed", async () => {
    const order = await paidOrder();
    expect(await statusOf(order.id)).toBe("confirmed");
    expect((await board()).preparing).toContain(order.orderNumber);

    expect((await setTask(order.taskIds[0], "in_progress")).status).toBe(200);
    expect(await statusOf(order.id)).toBe("preparing");

    await setTask(order.taskIds[0], "completed");
    expect(await statusOf(order.id)).toBe("preparing"); // one dish still to do

    await setTask(order.taskIds[1], "in_progress");
    await setTask(order.taskIds[1], "completed");
    expect(await statusOf(order.id)).toBe("ready");
    const readyBoard = await board();
    expect(readyBoard.ready).toContain(order.orderNumber);
    expect(readyBoard.preparing).not.toContain(order.orderNumber);

    // The ready order stays on the kitchen display, with its dishes, until handed over.
    const queue = await request(app).get("/api/kitchen/tasks").set(auth(staff));
    const cards = (queue.body as { orderId: string; orderStatus: string }[]).filter((t) => t.orderId === order.id);
    expect(cards).toHaveLength(2);
    expect(cards.every((t) => t.orderStatus === "ready")).toBe(true);

    expect((await handOver(order.id)).status).toBe(204);
    expect(await statusOf(order.id)).toBe("completed");
    const after = await board();
    expect(after.ready).not.toContain(order.orderNumber);
    const queueAfter = await request(app).get("/api/kitchen/tasks").set(auth(staff));
    expect((queueAfter.body as { orderId: string }[]).some((t) => t.orderId === order.id)).toBe(false);
  });

  it("refuses Handed over before every dish is done, and a second time", async () => {
    const order = await paidOrder();
    const early = await handOver(order.id);
    expect(early.status).toBe(409);
    expect(early.body.error).toContain("isn't ready yet");

    for (const id of order.taskIds) await setTask(id, "completed");
    expect((await handOver(order.id)).status).toBe(204);
    const again = await handOver(order.id);
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("already handed over");
  });

  it("doesn't let a dish of a handed-over order change", async () => {
    const order = await paidOrder();
    for (const id of order.taskIds) await setTask(id, "completed");
    await handOver(order.id);
    const res = await setTask(order.taskIds[0], "in_progress");
    expect(res.status).toBe(409);
    expect(await statusOf(order.id)).toBe("completed");
  });

  it("never touches an unpaid order", async () => {
    const placed = await request(app).post("/api/orders").set(auth(customer)).send({ items: [{ productId: coffee.id, qty: 1 }], paymentMethod: "counter" });
    expect((await handOver(placed.body.id)).status).toBe(409);
    expect(await statusOf(placed.body.id)).toBe("pending");
    const b = await board();
    expect([...b.preparing, ...b.ready]).not.toContain(placed.body.orderNumber);
  });

  it("returns 404 for Handed over on an order that doesn't exist", async () => {
    expect((await handOver("99999999-9999-4999-8999-999999999999")).status).toBe(404);
  });
});

describe("the status board", () => {
  it("needs no sign-in and gives order numbers only", async () => {
    await paidOrder();
    const res = await request(app).get("/api/orders/board");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["preparing", "ready"]);
    for (const value of [...res.body.preparing, ...res.body.ready]) expect(value).toMatch(/^ZK-[A-Z0-9]+$/);
  });
});
