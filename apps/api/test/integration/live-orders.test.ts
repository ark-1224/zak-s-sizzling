import { createServer } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { attachWebSocket } from "../../src/websocket";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// The payment queue reloads live: every change to an order (placed, item edited,
// cancelled, paid) sends "orders:changed" to connected screens. The event carries no
// order data because kiosks receive it too. Uses a Socket.IO server that isn't listening
// and watches what it emits.

const coffee = PRODUCTS.coffee;
const io = attachWebSocket(createServer());
let emit: MockInstance;
let customer: string;
let staff: string;

beforeAll(async () => {
  customer = await kioskToken();
  staff = await loginAs("staff");
});

beforeEach(() => {
  emit = vi.spyOn(io, "emit");
});

afterAll(() => {
  vi.restoreAllMocks();
  io.close();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const changedCount = () => emit.mock.calls.filter(([event]) => event === "orders:changed").length;

async function placeOrder(qty = 1) {
  const res = await request(app)
    .post("/api/orders")
    .set(auth(customer))
    .send({ items: [{ productId: coffee.id, qty }], paymentMethod: "counter" });
  expect(res.status).toBe(201);
  return res.body as { id: string; items: { id: string }[] };
}

describe("orders:changed", () => {
  it("is sent when an order is placed, with no order data", async () => {
    await placeOrder();
    expect(changedCount()).toBe(1);
    const call = emit.mock.calls.find(([event]) => event === "orders:changed")!;
    expect(call).toHaveLength(1);
  });

  it("is sent when staff change an item's quantity or remove an item", async () => {
    const order = await placeOrder(2);
    emit.mockClear();
    const patch = await request(app).patch(`/api/orders/${order.id}/items/${order.items[0].id}`).set(auth(staff)).send({ qty: 1 });
    expect(patch.status).toBe(200);
    expect(changedCount()).toBe(1);
  });

  it("is sent when an unpaid order is cancelled", async () => {
    const order = await placeOrder();
    emit.mockClear();
    const res = await request(app).post(`/api/orders/${order.id}/cancel`).set(auth(staff));
    expect(res.status).toBe(200);
    expect(changedCount()).toBe(1);
  });

  it("is sent when staff confirm a counter payment", async () => {
    const order = await placeOrder();
    emit.mockClear();
    const res = await request(app).post(`/api/payments/counter/${order.id}/confirm`).set(auth(staff));
    expect(res.status).toBe(200);
    expect(changedCount()).toBeGreaterThanOrEqual(1);
  });

  it("is not sent when a request is refused", async () => {
    const order = await placeOrder();
    await request(app).post(`/api/payments/counter/${order.id}/confirm`).set(auth(staff));
    emit.mockClear();
    const res = await request(app).post(`/api/orders/${order.id}/cancel`).set(auth(staff));
    expect(res.status).toBe(409);
    expect(changedCount()).toBe(0);
  });
});
