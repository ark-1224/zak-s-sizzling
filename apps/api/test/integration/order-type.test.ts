import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// Dine in or take out: chosen on the kiosk, saved on the order, and shown on the receipt,
// the kitchen display and the payment queue. Uses Test Bottled Water like orders.test.ts.

let customer: string;
let staff: string;

beforeAll(async () => {
  customer = await kioskToken();
  staff = await loginAs("staff");
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const placeOrder = (body: object) =>
  request(app)
    .post("/api/orders")
    .set(auth(customer))
    .send({ items: [{ productId: PRODUCTS.water.id, qty: 1 }], paymentMethod: "counter", ...body });

describe("dine in or take out", () => {
  it("saves a take-out order as take out", async () => {
    const res = await placeOrder({ orderType: "take_out" });

    expect(res.status).toBe(201);
    expect(res.body.orderType).toBe("take_out");
  });

  it("saves a dine-in order as dine in", async () => {
    expect((await placeOrder({ orderType: "dine_in" })).body.orderType).toBe("dine_in");
  });

  it("counts an order that doesn't say as dine in", async () => {
    expect((await placeOrder({})).body.orderType).toBe("dine_in");
  });

  it("refuses anything else", async () => {
    expect((await placeOrder({ orderType: "delivery" })).status).toBe(400);
  });

  it("is on the receipt, the payment queue and the kitchen display", async () => {
    const placed = await placeOrder({ orderType: "take_out" });

    const receipt = await request(app).get(`/api/orders/${placed.body.id}/receipt`).set(auth(customer));
    expect(receipt.body.orderType).toBe("take_out");

    const queue = await request(app).get("/api/orders?unpaid=1").set(auth(staff));
    expect(queue.body.find((o: { id: string }) => o.id === placed.body.id).orderType).toBe("take_out");

    await request(app).post(`/api/payments/counter/${placed.body.id}/confirm`).set(auth(staff));
    const tasks = await request(app).get("/api/kitchen/tasks").set(auth(staff));
    const task = tasks.body.find((t: { orderId: string }) => t.orderId === placed.body.id);
    expect(task.orderType).toBe("take_out");
  });
});
