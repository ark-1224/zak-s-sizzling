import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { countOrdersInKitchen, estimatePrepMinutes } from "../../src/modules/orders/prepTime";
import { app, kioskToken, loginAs } from "./helpers";

// Estimated preparation time: the product's prep minutes, the estimate on a new order,
// and the ready time set when the order reaches the kitchen. Other test files leave
// orders in the kitchen, so queue-dependent checks read the queue first instead of
// assuming it is empty.

let admin: string;
let staff: string;
let customer: string;
let categoryId: number;
const ids = { plate: "", side: "", drink: "" };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createProduct(name: string, prepMinutes: number) {
  const res = await request(app)
    .post("/api/products")
    .set(auth(admin))
    .send({ name, price: 100, categoryId, stockQty: 200, minStockThreshold: 0, prepMinutes });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const placeOrder = (items: { productId: string; qty: number }[]) =>
  request(app).post("/api/orders").set(auth(customer)).send({ items, paymentMethod: "counter" });
const confirm = (orderId: string) => request(app).post(`/api/payments/counter/${orderId}/confirm`).set(auth(staff));

beforeAll(async () => {
  admin = await loginAs("admin");
  staff = await loginAs("staff");
  customer = await kioskToken();
  categoryId = (await request(app).get("/api/categories")).body[0].id;
  ids.plate = await createProduct("Prep Test Plate", 12);
  ids.side = await createProduct("Prep Test Side", 5);
  ids.drink = await createProduct("Prep Test Bottled Drink", 0);
});

describe("a product's preparation time", () => {
  it("is saved and returned with the product", async () => {
    const res = await request(app).get(`/api/products/${ids.plate}`);

    expect(res.body.prepMinutes).toBe(12);
  });

  it("defaults to 10 minutes when the form leaves it out", async () => {
    const res = await request(app).post("/api/products").set(auth(admin)).send({ name: "Prep Test Default", price: 50, categoryId });

    expect(res.status).toBe(201);
    expect(res.body.prepMinutes).toBe(10);
  });

  it("can be changed, including to 0 for an item served as it is", async () => {
    const res = await request(app).put(`/api/products/${ids.side}`).set(auth(admin)).send({ prepMinutes: 0 });
    expect(res.body.prepMinutes).toBe(0);

    const back = await request(app).put(`/api/products/${ids.side}`).set(auth(admin)).send({ prepMinutes: 5 });
    expect(back.body.prepMinutes).toBe(5);
  });

  it.each([
    ["negative", -1],
    ["over 120 minutes", 121],
    ["not whole minutes", 7.5],
    ["not a number", "ten"],
  ])("is refused when %s", async (_label, prepMinutes) => {
    const res = await request(app).put(`/api/products/${ids.plate}`).set(auth(admin)).send({ prepMinutes });

    expect(res.status).toBe(400);
  });

  it("can't be changed by staff", async () => {
    const res = await request(app).put(`/api/products/${ids.plate}`).set(auth(staff)).send({ prepMinutes: 1 });

    expect(res.status).toBe(403);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.plate } })).prepMinutes).toBe(12);
  });
});

describe("the estimate on a new order", () => {
  it("uses the longest dish, the extra servings and the orders in the kitchen", async () => {
    const ahead = await countOrdersInKitchen();
    const res = await placeOrder([
      { productId: ids.plate, qty: 2 },
      { productId: ids.side, qty: 1 },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.estimatedPrepMinutes).toBe(12 + 2 + 2 * ahead);
    expect(res.body.estimatedReadyAt).toBeNull(); // not in the kitchen until it's paid
  });

  it("is 0 for an order of ready-to-serve items only", async () => {
    const res = await placeOrder([{ productId: ids.drink, qty: 3 }]);

    expect(res.body.estimatedPrepMinutes).toBe(0);
  });

  it("is on the receipt", async () => {
    const placed = await placeOrder([{ productId: ids.plate, qty: 1 }]);
    const receipt = await request(app).get(`/api/orders/${placed.body.id}/receipt`).set(auth(customer));

    expect(receipt.body.estimatedPrepMinutes).toBe(placed.body.estimatedPrepMinutes);
  });
});

describe("when the order reaches the kitchen", () => {
  it("works the estimate out again and sets the ready time", async () => {
    const placed = await placeOrder([{ productId: ids.plate, qty: 3 }]);
    const ahead = await countOrdersInKitchen(placed.body.id);
    const before = Date.now();

    expect((await confirm(placed.body.id)).status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } });
    const minutes = estimatePrepMinutes([{ prepMinutes: 12, qty: 3 }], ahead);
    expect(order.estimatedPrepMinutes).toBe(minutes);
    const readyAt = order.estimatedReadyAt!.getTime();
    expect(readyAt).toBeGreaterThanOrEqual(before + minutes * 60_000 - 1000);
    expect(readyAt).toBeLessThanOrEqual(Date.now() + minutes * 60_000 + 1000);
  });

  it("counts the order before it in the queue: the next one is 2 minutes later", async () => {
    const first = await placeOrder([{ productId: ids.plate, qty: 1 }]);
    await confirm(first.body.id);
    const second = await placeOrder([{ productId: ids.plate, qty: 1 }]);
    await confirm(second.body.id);

    const [a, b] = await Promise.all(
      [first.body.id, second.body.id].map((id) => prisma.order.findUniqueOrThrow({ where: { id } }))
    );
    expect(b.estimatedPrepMinutes! - a.estimatedPrepMinutes!).toBe(2);
  });

  it("leaves an order out of the queue once all its dishes are done", async () => {
    const placed = await placeOrder([{ productId: ids.side, qty: 1 }]);
    await confirm(placed.body.id);
    const withIt = await countOrdersInKitchen();

    await prisma.kitchenTask.updateMany({
      where: { orderItem: { orderId: placed.body.id } },
      data: { status: "completed", completedAt: new Date() },
    });

    expect(await countOrdersInKitchen()).toBe(withIt - 1);
  });

  it("shows the ready time on the kitchen display and the order", async () => {
    const placed = await placeOrder([{ productId: ids.plate, qty: 1 }]);
    await confirm(placed.body.id);

    const tasks = await request(app).get("/api/kitchen/tasks").set(auth(staff));
    const task = tasks.body.find((t: { orderId: string }) => t.orderId === placed.body.id);
    const order = await request(app).get(`/api/orders/${placed.body.id}`).set(auth(staff));

    expect(order.body.estimatedReadyAt).toEqual(expect.any(String));
    expect(task.orderEstimatedReadyAt).toBe(order.body.estimatedReadyAt);
  });
});

describe("the estimate at checkout, for different order sizes", () => {
  const estimate = (items: { productId: string; qty: number }[]) =>
    request(app).post("/api/orders/estimate").set(auth(customer)).send({ items });

  it.each([
    ["one plate", () => [{ productId: ids.plate, qty: 1 }], 12],
    ["three plates", () => [{ productId: ids.plate, qty: 3 }], 12 + 2],
    ["ten plates", () => [{ productId: ids.plate, qty: 10 }], 12 + 9],
    [
      "a family order: four plates, two sides and four drinks",
      () => [
        { productId: ids.plate, qty: 4 },
        { productId: ids.side, qty: 2 },
        { productId: ids.drink, qty: 4 },
      ],
      12 + 5,
    ],
  ])("%s", async (_label, items, withoutQueue) => {
    const res = await estimate(items());

    expect(res.status).toBe(200);
    expect(res.body.ordersAhead).toBe(await countOrdersInKitchen());
    expect(res.body.estimatedPrepMinutes).toBe(withoutQueue + 2 * res.body.ordersAhead);
  });

  it("is 0 for drinks only, however many", async () => {
    expect((await estimate([{ productId: ids.drink, qty: 12 }])).body.estimatedPrepMinutes).toBe(0);
  });

  it("matches what the order gets when it's placed", async () => {
    const items = [
      { productId: ids.plate, qty: 2 },
      { productId: ids.side, qty: 3 },
    ];
    const before = await estimate(items);
    const placed = await placeOrder(items);

    expect(placed.body.estimatedPrepMinutes).toBe(before.body.estimatedPrepMinutes);
  });

  it("grows by 2 minutes once another order reaches the kitchen", async () => {
    const items = [{ productId: ids.plate, qty: 1 }];
    const before = (await estimate(items)).body.estimatedPrepMinutes;

    const other = await placeOrder([{ productId: ids.side, qty: 1 }]);
    await confirm(other.body.id);

    expect((await estimate(items)).body.estimatedPrepMinutes).toBe(before + 2);
  });

  it("refuses an empty cart and a product that doesn't exist", async () => {
    expect((await estimate([])).status).toBe(400);
    expect((await estimate([{ productId: "99999999-9999-4999-8999-999999999999", qty: 1 }])).status).toBe(404);
  });

  it("needs a kiosk session or a sign-in", async () => {
    const res = await request(app).post("/api/orders/estimate").send({ items: [{ productId: ids.plate, qty: 1 }] });

    expect(res.status).toBe(401);
  });
});
