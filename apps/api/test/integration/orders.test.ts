import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// Kiosk ordering and counter checkout, end to end. Uses Test Bottled Water, which no
// other test file touches.

let customer: string;
let otherCustomer: string;
let staff: string;

beforeAll(async () => {
  customer = await kioskToken();
  otherCustomer = await kioskToken();
  staff = await loginAs("staff");
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const placeOrder = (body: object, token = customer) => request(app).post("/api/orders").set(auth(token)).send(body);
const water = PRODUCTS.water;
const waterStock = async () => (await prisma.inventory.findUniqueOrThrow({ where: { productId: water.id } })).stockQty;

describe("placing an order at the kiosk", () => {
  it("creates a pending order with a readable order number and a pending payment", async () => {
    const res = await placeOrder({ items: [{ productId: water.id, qty: 2 }], paymentMethod: "counter" });

    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toMatch(/^ZK-[A-HJ-NP-Z2-9]{6}$/); // no 0/O/1/I, to avoid misreading
    expect(res.body.status).toBe("pending");
    expect(res.body.payment).toMatchObject({ method: "counter", status: "pending", amount: 50 });
  });

  it("computes prices on the server and ignores any price the client sends", async () => {
    const res = await placeOrder({ items: [{ productId: water.id, qty: 3, unitPrice: 1, subtotal: 3 }], totalAmount: 3 });

    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({ unitPrice: 25, subtotal: 75 });
    expect(res.body.totalAmount).toBe(75);
  });

  it("adds up several lines into the order total", async () => {
    const res = await placeOrder({
      items: [
        { productId: water.id, qty: 1 },
        { productId: PRODUCTS.sisig.id, qty: 1 },
      ],
    });

    expect(res.body.totalAmount).toBe(25 + 185);
  });

  it("keeps special instructions for the kitchen", async () => {
    const res = await placeOrder({ items: [{ productId: water.id, qty: 1, specialInstructions: "No ice, please" }] });

    expect(res.body.items[0].specialInstructions).toBe("No ice, please");
  });

  it("does not deduct stock until payment is confirmed", async () => {
    const before = await waterStock();

    await placeOrder({ items: [{ productId: water.id, qty: 4 }] });

    expect(await waterStock()).toBe(before);
  });

  it.each([
    ["no items", { items: [] }],
    ["a zero quantity", { items: [{ productId: water.id, qty: 0 }] }],
    ["a quantity above 999", { items: [{ productId: water.id, qty: 1000 }] }],
    ["an invalid product id", { items: [{ productId: "not-a-uuid", qty: 1 }] }],
    ["instructions over 140 characters", { items: [{ productId: water.id, qty: 1, specialInstructions: "x".repeat(141) }] }],
    ["an unknown payment method", { items: [{ productId: water.id, qty: 1 }], paymentMethod: "cash" }],
  ])("rejects an order with %s", async (_label, body) => {
    const res = await placeOrder(body);

    expect(res.status).toBe(400);
  });

  it("returns 404 for a product that does not exist", async () => {
    const res = await placeOrder({ items: [{ productId: "99999999-9999-4999-8999-999999999999", qty: 1 }] });

    expect(res.status).toBe(404);
  });

  it("refuses a sold-out product", async () => {
    const res = await placeOrder({ items: [{ productId: PRODUCTS.calamares.id, qty: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(`${PRODUCTS.calamares.name} is currently unavailable`);
  });

  it("refuses more than is in stock", async () => {
    const res = await placeOrder({ items: [{ productId: water.id, qty: (await waterStock()) + 1 }] });

    expect(res.status).toBe(409);
  });

  it("requires a kiosk session", async () => {
    const res = await request(app).post("/api/orders").send({ items: [{ productId: water.id, qty: 1 }] });

    expect(res.status).toBe(401);
  });
});

describe("viewing an order and its receipt", () => {
  let orderId: string;

  beforeAll(async () => {
    orderId = (await placeOrder({ items: [{ productId: water.id, qty: 1 }], paymentMethod: "counter" })).body.id;
  });

  it("lets the customer who placed it see the order and the receipt", async () => {
    const order = await request(app).get(`/api/orders/${orderId}`).set(auth(customer));
    const receipt = await request(app).get(`/api/orders/${orderId}/receipt`).set(auth(customer));

    expect(order.status).toBe(200);
    expect(receipt.status).toBe(200);
    expect(receipt.body.orderNumber).toBe(order.body.orderNumber);
  });

  it("hides it from a different kiosk session as if it did not exist", async () => {
    const res = await request(app).get(`/api/orders/${orderId}/receipt`).set(auth(otherCustomer));

    expect(res.status).toBe(404);
  });

  it("lets staff see any order", async () => {
    const res = await request(app).get(`/api/orders/${orderId}`).set(auth(staff));

    expect(res.status).toBe(200);
  });

  it("returns 404 for an order that does not exist", async () => {
    const res = await request(app).get("/api/orders/99999999-9999-4999-8999-999999999999").set(auth(staff));

    expect(res.status).toBe(404);
  });

  it("shows the order in the staff list of orders awaiting payment", async () => {
    const res = await request(app).get("/api/orders?unpaid=1").set(auth(staff));

    expect(res.body.map((o: { id: string }) => o.id)).toContain(orderId);
  });
});

describe("staff correcting a pending order", () => {
  let orderId: string;
  let waterItemId: string;
  let sisigItemId: string;

  beforeAll(async () => {
    const order = await placeOrder({
      items: [
        { productId: water.id, qty: 1 },
        { productId: PRODUCTS.sisig.id, qty: 1 },
      ],
      paymentMethod: "counter",
    });
    orderId = order.body.id;
    waterItemId = order.body.items.find((i: { productId: string }) => i.productId === water.id).id;
    sisigItemId = order.body.items.find((i: { productId: string }) => i.productId === PRODUCTS.sisig.id).id;
  });

  it("changes a quantity and recalculates the line and the order total", async () => {
    const res = await request(app).patch(`/api/orders/${orderId}/items/${waterItemId}`).set(auth(staff)).send({ qty: 3 });

    expect(res.status).toBe(200);
    expect(Number(res.body.subtotal)).toBe(75);
    const order = await request(app).get(`/api/orders/${orderId}`).set(auth(staff));
    expect(order.body.totalAmount).toBe(75 + 185);
  });

  it("removes a line and recalculates the total", async () => {
    const res = await request(app).delete(`/api/orders/${orderId}/items/${sisigItemId}`).set(auth(staff));

    expect(res.status).toBe(204);
    const order = await request(app).get(`/api/orders/${orderId}`).set(auth(staff));
    expect(order.body.items).toHaveLength(1);
    expect(order.body.totalAmount).toBe(75);
  });

  it("rejects an invalid quantity", async () => {
    const res = await request(app).patch(`/api/orders/${orderId}/items/${waterItemId}`).set(auth(staff)).send({ qty: 0 });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an item that belongs to another order", async () => {
    const other = await placeOrder({ items: [{ productId: water.id, qty: 1 }] });

    const res = await request(app).patch(`/api/orders/${orderId}/items/${other.body.items[0].id}`).set(auth(staff)).send({ qty: 2 });

    expect(res.status).toBe(404);
  });

  it("does not let a kiosk customer edit items", async () => {
    const res = await request(app).patch(`/api/orders/${orderId}/items/${waterItemId}`).set(auth(customer)).send({ qty: 9 });

    expect(res.status).toBe(403);
  });
});

describe("confirming a counter payment", () => {
  let orderId: string;

  beforeAll(async () => {
    orderId = (await placeOrder({ items: [{ productId: water.id, qty: 2 }], paymentMethod: "counter" })).body.id;
  });

  it("does not let a kiosk customer confirm their own payment", async () => {
    const res = await request(app).post(`/api/payments/counter/${orderId}/confirm`).set(auth(customer));

    expect(res.status).toBe(403);
  });

  it("marks the order paid and confirmed, deducts stock, and sends it to the kitchen", async () => {
    const before = await waterStock();

    const res = await request(app).post(`/api/payments/counter/${orderId}/confirm`).set(auth(staff));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.payment).toMatchObject({ method: "counter", status: "paid" });
    expect(res.body.payment.paidAt).toEqual(expect.any(String));
    expect(await waterStock()).toBe(before - 2);
    expect(await prisma.kitchenTask.count({ where: { orderItem: { orderId } } })).toBe(1);
  });

  it("refuses to confirm the same order twice, and deducts nothing the second time", async () => {
    const before = await waterStock();

    const res = await request(app).post(`/api/payments/counter/${orderId}/confirm`).set(auth(staff));

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Order is already paid");
    expect(await waterStock()).toBe(before);
  });

  it("locks the items once the order is confirmed", async () => {
    const order = await request(app).get(`/api/orders/${orderId}`).set(auth(staff));

    const res = await request(app).patch(`/api/orders/${orderId}/items/${order.body.items[0].id}`).set(auth(staff)).send({ qty: 1 });

    expect(res.status).toBe(409);
  });

  it("drops the order from the list of orders awaiting payment", async () => {
    const res = await request(app).get("/api/orders?unpaid=1").set(auth(staff));

    expect(res.body.map((o: { id: string }) => o.id)).not.toContain(orderId);
  });

  it("returns 404 for an order that does not exist", async () => {
    const res = await request(app).post("/api/payments/counter/99999999-9999-4999-8999-999999999999/confirm").set(auth(staff));

    expect(res.status).toBe(404);
  });
});

describe("cancelling an unpaid order (UI review #15)", () => {
  let orderId: string;
  const cancel = (id: string, token = staff) => request(app).post(`/api/orders/${id}/cancel`).set(auth(token));
  const unpaidIds = async () => (await request(app).get("/api/orders?unpaid=1").set(auth(staff))).body.map((o: { id: string }) => o.id);

  beforeAll(async () => {
    orderId = (await placeOrder({ items: [{ productId: water.id, qty: 1 }], paymentMethod: "counter" })).body.id;
  });

  it("does not let a kiosk customer cancel an order", async () => {
    const res = await cancel(orderId, customer);

    expect(res.status).toBe(403);
  });

  it("cancels the order, returns no stock (none was taken), and drops it from the payment queue", async () => {
    const before = await waterStock();
    expect(await unpaidIds()).toContain(orderId);

    const res = await cancel(orderId);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    expect(await waterStock()).toBe(before);
    expect(await unpaidIds()).not.toContain(orderId);
  });

  it("keeps the cancelled order on record", async () => {
    const res = await request(app).get(`/api/orders/${orderId}`).set(auth(staff));

    expect(res.body).toMatchObject({ id: orderId, status: "cancelled" });
  });

  it("refuses to cancel it a second time", async () => {
    const res = await cancel(orderId);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/is already cancelled$/);
  });

  it("refuses to take payment for it, deducting nothing and sending nothing to the kitchen", async () => {
    const before = await waterStock();

    const res = await request(app).post(`/api/payments/counter/${orderId}/confirm`).set(auth(staff));

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/was cancelled, so it can't be paid$/);
    expect(await waterStock()).toBe(before);
    expect(await prisma.kitchenTask.count({ where: { orderItem: { orderId } } })).toBe(0);
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe("pending");
  });

  it("refuses to start an online payment for it", async () => {
    const res = await request(app).post("/api/payments/intent").set(auth(customer)).send({ orderId, method: "gcash" });

    expect(res.status).toBe(409);
  });

  it("locks its items", async () => {
    const order = await request(app).get(`/api/orders/${orderId}`).set(auth(staff));

    const res = await request(app).patch(`/api/orders/${orderId}/items/${order.body.items[0].id}`).set(auth(staff)).send({ qty: 2 });

    expect(res.status).toBe(409);
  });

  it("refuses to cancel an order that is already paid", async () => {
    const paidId = (await placeOrder({ items: [{ productId: water.id, qty: 1 }], paymentMethod: "counter" })).body.id;
    await request(app).post(`/api/payments/counter/${paidId}/confirm`).set(auth(staff));

    const res = await cancel(paidId);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/is already paid, so it can't be cancelled$/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: paidId } })).status).toBe("confirmed");
  });

  it("returns 404 for an order that does not exist, including a malformed id", async () => {
    expect((await cancel("99999999-9999-4999-8999-999999999999")).status).toBe(404);
    expect((await cancel("not-an-id")).status).toBe(404);
  });
});
