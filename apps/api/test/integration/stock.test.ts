import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS, RAW_MATERIALS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// Raw-material stock end to end (docs/design/raw-material-stock.md). The tests in
// this file build on each other and run in order against the shared test database.

let customer: string;
let staff: string;

beforeAll(async () => {
  customer = await kioskToken();
  staff = await loginAs("staff");
});

const materialQty = async (key: keyof typeof RAW_MATERIALS) =>
  (await prisma.rawMaterial.findUniqueOrThrow({ where: { name: RAW_MATERIALS[key].name } })).stockQty.toNumber();
const unitQty = async (productId: string) => (await prisma.inventory.findUniqueOrThrow({ where: { productId } })).stockQty;
const setMaterialQty = (key: keyof typeof RAW_MATERIALS, stockQty: number) =>
  prisma.rawMaterial.update({ where: { name: RAW_MATERIALS[key].name }, data: { stockQty } });

async function placeOrder(items: { productId: string; qty: number }[]) {
  return request(app).post("/api/orders").set("Authorization", `Bearer ${customer}`).send({ items, paymentMethod: "counter" });
}
async function confirmPayment(orderId: string) {
  return request(app).post(`/api/payments/counter/${orderId}/confirm`).set("Authorization", `Bearer ${staff}`);
}

describe("confirming payment for a recipe dish", () => {
  let orderId: string;

  it("deducts every raw material in the recipe, times the quantity", async () => {
    const order = await placeOrder([{ productId: PRODUCTS.riceBowl.id, qty: 2 }]);
    expect(order.status).toBe(201);
    orderId = order.body.id;

    const res = await confirmPayment(orderId);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(await materialQty("pork")).toBe(1000 - 2 * 150);
    expect(await materialQty("rice")).toBe(500 - 2 * 200);
  });

  it("records one sale movement per raw material, linked to the order", async () => {
    const movements = await prisma.rawMaterialMovement.findMany({ where: { orderId }, include: { rawMaterial: true } });

    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.type === "sale")).toBe(true);
    const rice = movements.find((m) => m.rawMaterial.name === RAW_MATERIALS.rice.name)!;
    expect({ delta: rice.delta.toNumber(), previous: rice.previousQty.toNumber(), next: rice.newQty.toNumber() }).toEqual({ delta: -400, previous: 500, next: 100 });
  });

  it("sends the order to the kitchen", async () => {
    const tasks = await prisma.kitchenTask.count({ where: { orderItem: { orderId } } });

    expect(tasks).toBe(1);
  });

  it("marks the dish sold out once an ingredient can no longer make a serving", async () => {
    // 100 g of rice left, and one serving needs 200 g.
    const res = await request(app).get(`/api/products/${PRODUCTS.riceBowl.id}`);

    expect(res.body.isAvailable).toBe(false);
  });
});

describe("placing an order", () => {
  it("is refused when the raw materials can't make it, naming the dish", async () => {
    await setMaterialQty("rice", 300); // enough for 1 serving, not 2
    await prisma.product.update({ where: { id: PRODUCTS.riceBowl.id }, data: { isAvailable: true } });

    const res = await placeOrder([{ productId: PRODUCTS.riceBowl.id, qty: 2 }]);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(`Sorry, there isn't enough stock for ${PRODUCTS.riceBowl.name} right now`);
  });
});

describe("a shortage at confirmation", () => {
  it("deducts nothing at all and leaves the order unpaid, even for items that were in stock", async () => {
    await setMaterialQty("rice", 300);
    const order = await placeOrder([
      { productId: PRODUCTS.riceBowl.id, qty: 1 },
      { productId: PRODUCTS.icedTea.id, qty: 2 },
    ]);
    expect(order.status).toBe(201);
    const porkBefore = await materialQty("pork");
    const teaBefore = await unitQty(PRODUCTS.icedTea.id);
    await setMaterialQty("rice", 150); // another sale used the rice before this was confirmed

    const res = await confirmPayment(order.body.id);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain(`${RAW_MATERIALS.rice.name}: needs 200 g, only 150 g left`);
    expect(await materialQty("pork")).toBe(porkBefore);
    expect(await unitQty(PRODUCTS.icedTea.id)).toBe(teaBefore);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.body.id }, include: { payment: true, items: { include: { kitchenTask: true } } } });
    expect(saved.status).toBe("pending");
    expect(saved.payment?.status).toBe("pending");
    expect(saved.items.every((i) => i.kitchenTask === null)).toBe(true);
  });

  it("can be confirmed once the stock is back", async () => {
    await setMaterialQty("rice", 300);
    const [order] = await prisma.order.findMany({ where: { status: "pending", items: { some: { productId: PRODUCTS.icedTea.id } } } });

    const res = await confirmPayment(order.id);

    expect(res.status).toBe(200);
    expect(await materialQty("rice")).toBe(100);
  });
});

describe("a unit-tracked product", () => {
  it("still deducts its own count", async () => {
    const before = await unitQty(PRODUCTS.icedTea.id);
    const order = await placeOrder([{ productId: PRODUCTS.icedTea.id, qty: 1 }]);

    await confirmPayment(order.body.id);

    expect(await unitQty(PRODUCTS.icedTea.id)).toBe(before - 1);
  });
});

describe("the database itself", () => {
  it("refuses negative raw-material stock", async () => {
    await expect(setMaterialQty("pork", -1)).rejects.toThrow(/raw_materials_stock_qty_nonnegative/);
  });

  it("refuses negative product stock", async () => {
    await expect(prisma.inventory.update({ where: { productId: PRODUCTS.icedTea.id }, data: { stockQty: -1 } })).rejects.toThrow(/inventory_stock_qty_nonnegative/);
  });
});
