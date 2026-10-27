import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// The transaction history (GET /api/orders/history, Administrator only): orders by date
// with filters, a page at a time, with totals and each order's timeline. Other test
// files place orders today too, so most checks search for this file's own orders.

const coffee = PRODUCTS.coffee;
let customer: string;
let admin: string;
let staff: string;
const orders: Record<"unpaid" | "paid" | "cancelled" | "handedOver", { id: string; orderNumber: string }> = {} as never;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const history = (query = "") => request(app).get(`/api/orders/history${query ? `?${query}` : ""}`).set(auth(admin));

async function place(qty = 1) {
  const res = await request(app).post("/api/orders").set(auth(customer)).send({ items: [{ productId: coffee.id, qty }], paymentMethod: "counter" });
  expect(res.status).toBe(201);
  return { id: res.body.id as string, orderNumber: res.body.orderNumber as string };
}

beforeAll(async () => {
  customer = await kioskToken();
  admin = await loginAs("admin");
  staff = await loginAs("staff");

  orders.unpaid = await place();
  orders.paid = await place(2);
  await request(app).post(`/api/payments/counter/${orders.paid.id}/confirm`).set(auth(staff));
  orders.cancelled = await place();
  await request(app).post(`/api/orders/${orders.cancelled.id}/cancel`).set(auth(staff));

  orders.handedOver = await place(3);
  await request(app).post(`/api/payments/counter/${orders.handedOver.id}/confirm`).set(auth(staff));
  const tasks = await prisma.kitchenTask.findMany({ where: { orderItem: { orderId: orders.handedOver.id } } });
  for (const task of tasks) {
    await request(app).patch(`/api/kitchen/tasks/${task.id}`).set(auth(staff)).send({ status: "in_progress" });
    await request(app).patch(`/api/kitchen/tasks/${task.id}`).set(auth(staff)).send({ status: "completed" });
  }
  await request(app).post(`/api/kitchen/orders/${orders.handedOver.id}/handed-over`).set(auth(staff));
});

describe("transaction history", () => {
  it("lists today's orders, newest first, by default", async () => {
    const res = await history();
    expect(res.status).toBe(200);
    const numbers = (res.body.orders as { orderNumber: string }[]).map((o) => o.orderNumber);
    for (const o of Object.values(orders)) expect(numbers).toContain(o.orderNumber);
    const times = (res.body.orders as { createdAt: string }[]).map((o) => o.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(res.body.from).toBe(res.body.to);
  });

  it("finds an order by its number however it's typed", async () => {
    const code = orders.paid.orderNumber.slice(3).toLowerCase();
    for (const q of [orders.paid.orderNumber, code, `zk ${code}`]) {
      const res = await history(`q=${encodeURIComponent(q)}`);
      expect(res.body.total).toBe(1);
      expect(res.body.orders[0].orderNumber).toBe(orders.paid.orderNumber);
    }
  });

  it("filters by status, payment and paid or unpaid", async () => {
    const cancelled = await history("status=cancelled");
    expect((cancelled.body.orders as { status: string }[]).every((o) => o.status === "cancelled")).toBe(true);
    expect((cancelled.body.orders as { orderNumber: string }[]).map((o) => o.orderNumber)).toContain(orders.cancelled.orderNumber);

    const unpaid = await history("paid=unpaid&method=counter");
    const unpaidNumbers = (unpaid.body.orders as { orderNumber: string }[]).map((o) => o.orderNumber);
    expect(unpaidNumbers).toContain(orders.unpaid.orderNumber);
    expect(unpaidNumbers).not.toContain(orders.paid.orderNumber);

    const paid = await history("paid=paid");
    expect((paid.body.orders as { payment: { status: string } }[]).every((o) => o.payment.status === "paid")).toBe(true);
  });

  it("totals the sales of paid orders only, with the average order value", async () => {
    const res = await history(`q=${orders.handedOver.orderNumber}`);
    expect(res.body.total).toBe(1);
    expect(res.body.paidCount).toBe(1);
    expect(res.body.sales).toBe(Number(coffee.price) * 3);
    expect(res.body.averageOrderValue).toBe(Number(coffee.price) * 3);

    const unpaid = await history(`q=${orders.unpaid.orderNumber}`);
    expect(unpaid.body.paidCount).toBe(0);
    expect(unpaid.body.sales).toBe(0);
    expect(unpaid.body.averageOrderValue).toBeNull();
  });

  it("gives each order its timeline", async () => {
    const done = (await history(`q=${orders.handedOver.orderNumber}`)).body.orders[0].timeline;
    for (const step of ["placedAt", "paidAt", "preparingAt", "readyAt", "handedOverAt"]) expect(done[step]).not.toBeNull();
    expect(done.cancelledAt).toBeNull();
    expect(done.placedAt <= done.paidAt && done.preparingAt <= done.readyAt && done.readyAt <= done.handedOverAt).toBe(true);

    const cancelled = (await history(`q=${orders.cancelled.orderNumber}`)).body.orders[0].timeline;
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(cancelled.paidAt).toBeNull();
    expect(cancelled.handedOverAt).toBeNull();
  });

  it("pages through the results", async () => {
    const first = await history("pageSize=1&page=1");
    const second = await history("pageSize=1&page=2");
    expect(first.body.orders).toHaveLength(1);
    expect(second.body.orders).toHaveLength(1);
    expect(first.body.orders[0].id).not.toBe(second.body.orders[0].id);
    expect(first.body.total).toBeGreaterThanOrEqual(4);
  });

  it("returns nothing for a range with no orders", async () => {
    const res = await history("from=2020-01-01&to=2020-01-02");
    expect(res.body.total).toBe(0);
    expect(res.body.orders).toEqual([]);
  });

  it("refuses a bad date or a range that ends before it starts", async () => {
    expect((await history("from=yesterday")).status).toBe(400);
    expect((await history("from=2026-10-10&to=2026-10-01")).status).toBe(400);
    expect((await history("pageSize=500")).status).toBe(400);
  });

  it("is for the Administrator only", async () => {
    expect((await request(app).get("/api/orders/history").set(auth(staff))).status).toBe(403);
  });
});
