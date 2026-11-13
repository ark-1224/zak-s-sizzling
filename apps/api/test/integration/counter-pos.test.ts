import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { refreshAvailability } from "../../src/modules/inventory/fulfillment";
import { PRODUCTS, RAW_MATERIALS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// The counter's light POS on Orders awaiting payment: staff take payment in cash (with the
// change) or by GCash / Maya recorded with its reference number, ring up walk-in orders,
// and see the paid orders in the kitchen, which they can cancel there. Plus the Stock
// movements tab's combined log. Uses Test Bottled Water (counted in pieces) and the recipe
// dish Test Sisig Rice Bowl; their stock is put back after this file.

const water = PRODUCTS.water;
const bowl = PRODUCTS.riceBowl;
const materialNames = Object.values(RAW_MATERIALS).map((m) => m.name);

let customer: string;
let staff: string;
let waterBefore: number;
let materialsBefore: { name: string; stockQty: number }[];

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  customer = await kioskToken();
  staff = await loginAs("staff");
  waterBefore = (await prisma.inventory.findUniqueOrThrow({ where: { productId: water.id } })).stockQty;
  const materials = await prisma.rawMaterial.findMany({ where: { name: { in: materialNames } } });
  materialsBefore = materials.map((m) => ({ name: m.name, stockQty: m.stockQty.toNumber() }));
  await prisma.inventory.update({ where: { productId: water.id }, data: { stockQty: 500 } });
  await prisma.rawMaterial.updateMany({ where: { name: { in: materialNames } }, data: { stockQty: 10_000 } });
  await refreshAvailability({ productIds: [water.id, bowl.id], materialIds: [] });
});

afterAll(async () => {
  await prisma.inventory.update({ where: { productId: water.id }, data: { stockQty: waterBefore } });
  for (const { name, stockQty } of materialsBefore) await prisma.rawMaterial.update({ where: { name }, data: { stockQty } });
  await refreshAvailability({ productIds: [water.id, bowl.id], materialIds: [] });
});

/** A kiosk order waiting to be paid at the counter. */
async function kioskOrder(items: { productId: string; qty: number }[] = [{ productId: water.id, qty: 2 }]) {
  const res = await request(app).post("/api/orders").set(auth(customer)).send({ items, paymentMethod: "counter" });
  expect(res.status).toBe(201);
  return res.body as { id: string; orderNumber: string; totalAmount: number };
}

const pay = (orderId: string, body?: object) => request(app).post(`/api/payments/counter/${orderId}/confirm`).set(auth(staff)).send(body ?? {});

describe("taking payment at the counter", () => {
  it("records cash with the amount handed over, for the change on the receipt", async () => {
    const order = await kioskOrder(); // 2 × ₱25

    const res = await pay(order.id, { method: "cash", amountTendered: 100 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "confirmed", payment: { method: "counter", status: "paid", amountTendered: 100, reference: null } });
  });

  it("still takes a cash payment with no body, as before the POS", async () => {
    const order = await kioskOrder();

    const res = await pay(order.id);

    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({ method: "counter", status: "paid", amountTendered: null });
  });

  it("refuses cash that doesn't cover the total, and leaves the order unpaid", async () => {
    const order = await kioskOrder();

    const res = await pay(order.id, { method: "cash", amountTendered: 40 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("The cash received is less than the total of ₱50.00");
    expect(await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({ status: "pending" });
  });

  it("records GCash and Maya with their reference numbers", async () => {
    const first = await kioskOrder();
    const second = await kioskOrder();

    const gcash = await pay(first.id, { method: "gcash", reference: "GC-1234567890" });
    const maya = await pay(second.id, { method: "maya", reference: "MY-0987654321" });

    expect(gcash.body.payment).toMatchObject({ method: "gcash", status: "paid", reference: "GC-1234567890", amountTendered: null });
    expect(maya.body.payment).toMatchObject({ method: "maya", status: "paid", reference: "MY-0987654321" });
  });

  it.each([
    ["an e-wallet payment without a reference number", { method: "gcash" }],
    ["a reference number shorter than 4 characters", { method: "maya", reference: "12" }],
    ["a reference number on a cash payment", { method: "cash", reference: "GC-1" }],
    ["cash received on an e-wallet payment", { method: "gcash", reference: "GC-55555", amountTendered: 100 }],
    ["a method the counter doesn't take", { method: "qrph" }],
  ])("refuses %s", async (_label, body) => {
    const order = await kioskOrder();

    const res = await pay(order.id, body);

    expect(res.status).toBe(400);
  });

  it("refuses a reference number already recorded for another order", async () => {
    const first = await kioskOrder();
    const second = await kioskOrder();
    await pay(first.id, { method: "gcash", reference: "GC-DUPLICATE-1" });

    const res = await pay(second.id, { method: "gcash", reference: "GC-DUPLICATE-1" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain(first.orderNumber);
    expect(await prisma.payment.findUniqueOrThrow({ where: { orderId: second.id } })).toMatchObject({ status: "pending" });
  });
});

describe("walk-in orders rung up by staff", () => {
  it("are placed as counter orders without a kiosk session, waiting in the queue", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(auth(staff))
      .send({ items: [{ productId: water.id, qty: 1, specialInstructions: "No ice" }], orderType: "take_out", paymentMethod: "qrph" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ source: "counter", orderType: "take_out", status: "pending", payment: { method: "counter", status: "pending" } });
    expect(res.body.items[0]).toMatchObject({ qty: 1, specialInstructions: "No ice" });
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(saved.kioskSessionId).toBeNull();
    const queue = await request(app).get("/api/orders?unpaid=1").set(auth(staff));
    expect(queue.body.map((o: { id: string }) => o.id)).toContain(res.body.id);
  });

  it("keep the kiosk's own orders as kiosk orders", async () => {
    const order = await kioskOrder();

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(saved).toMatchObject({ source: "kiosk" });
    expect(saved.kioskSessionId).not.toBeNull();
  });
});

describe("paid orders in the kitchen", () => {
  it("lists paid orders not yet handed over, with each dish's kitchen progress", async () => {
    const paid = await kioskOrder([
      { productId: water.id, qty: 1 },
      { productId: bowl.id, qty: 1 },
    ]);
    await pay(paid.id);
    const task = await prisma.kitchenTask.findFirstOrThrow({ where: { orderItem: { orderId: paid.id, productId: bowl.id } } });
    await request(app).patch(`/api/kitchen/tasks/${task.id}`).set(auth(staff)).send({ status: "in_progress" });
    const unpaid = await kioskOrder();

    const res = await request(app).get("/api/orders?inKitchen=1").set(auth(staff));

    expect(res.status).toBe(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(paid.id);
    expect(ids).not.toContain(unpaid.id);
    const listed = res.body.find((o: { id: string }) => o.id === paid.id);
    expect(listed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: bowl.id, kitchenStatus: "in_progress" }),
        expect.objectContaining({ productId: water.id, kitchenStatus: "pending" }),
      ])
    );
  });

  it("drops an order from the list once staff cancel it, and says how it was paid in the refund note", async () => {
    const order = await kioskOrder();
    await pay(order.id, { method: "maya", reference: "MY-CANCEL-001" });

    const cancel = await request(app).post(`/api/kitchen/orders/${order.id}/cancel`).set(auth(staff)).send({ reason: "Customer left" });
    const list = await request(app).get("/api/orders?inKitchen=1").set(auth(staff));

    expect(cancel.status).toBe(204);
    expect(list.body.map((o: { id: string }) => o.id)).not.toContain(order.id);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.stockIssueNote).toContain("Cancelled while in the kitchen: Customer left. Refund the customer ₱50.00 (paid by Maya).");
  });

  it("keeps the list from customers", async () => {
    const res = await request(app).get("/api/orders?inKitchen=1").set(auth(customer));

    expect(res.status).toBe(403);
  });
});

describe("the Stock movements log", () => {
  const movements = (query = "") => request(app).get(`/api/inventory/movements${query}`).set(auth(staff));

  it("lists raw materials' and ready-made items' changes together, newest first", async () => {
    const order = await kioskOrder([
      { productId: water.id, qty: 3 },
      { productId: bowl.id, qty: 1 },
    ]);
    await pay(order.id);
    await request(app).patch(`/api/inventory/${water.id}`).set(auth(staff)).send({ delta: 5, reason: "restock", note: "Delivery" });

    const res = await movements();

    expect(res.status).toBe(200);
    const sale = res.body.filter((m: { orderNumber: string | null }) => m.orderNumber === order.orderNumber);
    expect(sale).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "ready_made", itemId: water.id, delta: -3, type: "sale", previousQty: null, unit: "pc" }),
        expect.objectContaining({ kind: "raw_material", itemName: RAW_MATERIALS.pork.name, delta: -150, type: "sale", unit: "g" }),
        expect.objectContaining({ kind: "raw_material", itemName: RAW_MATERIALS.rice.name, delta: -200, type: "sale" }),
      ])
    );
    expect(res.body[0]).toMatchObject({ kind: "ready_made", itemId: water.id, delta: 5, type: "restock", reason: "restock", note: "Delivery", adjustedByName: "Test Staff" });
    const times = res.body.map((m: { createdAt: string }) => m.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("filters by kind of item, one item and kind of change", async () => {
    const readyMade = await movements("?kind=ready_made");
    const rawSales = await movements("?kind=raw_material&type=sale");
    const waterRestocks = await movements(`?itemId=${water.id}&type=restock`);

    expect(readyMade.body.length).toBeGreaterThan(0);
    expect(readyMade.body.every((m: { kind: string }) => m.kind === "ready_made")).toBe(true);
    expect(rawSales.body.every((m: { kind: string; type: string }) => m.kind === "raw_material" && m.type === "sale")).toBe(true);
    expect(waterRestocks.body.length).toBeGreaterThan(0);
    expect(waterRestocks.body.every((m: { itemId: string; type: string }) => m.itemId === water.id && m.type === "restock")).toBe(true);
  });

  it("filters by Manila dates, both included", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

    const todays = await movements(`?from=${today}&to=${today}`);
    const future = await movements("?from=2099-01-01");

    expect(todays.body.length).toBeGreaterThan(0);
    expect(future.body).toEqual([]);
  });

  it.each([
    ["a start date after the end date", "?from=2026-11-13&to=2026-11-01"],
    ["a date that isn't a date", "?from=yesterday"],
    ["an unknown kind of change", "?type=theft"],
  ])("refuses %s", async (_label, query) => {
    expect((await movements(query)).status).toBe(400);
  });
});
