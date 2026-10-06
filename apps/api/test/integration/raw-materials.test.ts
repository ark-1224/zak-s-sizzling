import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// Raw materials and recipes through the admin screens' API (Stock per raw material,
// session 3/4). Test files share one database and run in no fixed order, so this file
// creates its own raw materials and dish instead of changing the seeded pork and rice
// that stock.test.ts counts on. The tests build on each other and run in order.

let admin: string;
let staff: string;
let customer: string;
let categoryId: number;

beforeAll(async () => {
  admin = await loginAs("admin");
  staff = await loginAs("staff");
  customer = await kioskToken();
  categoryId = (await request(app).get("/api/categories")).body[0].id;
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const MISSING_ID = "99999999-9999-4999-8999-999999999999";

// Created in the first tests below and used by the rest.
const chicken = { id: "", name: "RM Test Chicken" }; // g
const sauce = { id: "", name: "RM Test Sauce" }; // ml
let dishId = "";

const createMaterial = (body: object, token = admin) => request(app).post("/api/raw-materials").set(as(token)).send(body);
const adjust = (id: string, body: object, token = staff) => request(app).patch(`/api/raw-materials/${id}/stock`).set(as(token)).send(body);
const listAs = async (token: string) => (await request(app).get("/api/raw-materials").set(as(token))).body as { id: string; stockQty: number }[];
const stockOf = async (id: string) => (await prisma.rawMaterial.findUniqueOrThrow({ where: { id } })).stockQty.toNumber();
const product = async (id: string, token?: string) =>
  (token ? await request(app).get(`/api/products/${id}`).set(as(token)) : await request(app).get(`/api/products/${id}`)).body;

describe("adding raw materials (Administrator)", () => {
  it("creates a raw material and logs its opening stock as a restock by the admin", async () => {
    const res = await createMaterial({ name: chicken.name, unit: "g", stockQty: 2000, minStockThreshold: 500, costPerUnit: 0.3 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: chicken.name, unit: "g", stockQty: 2000, minStockThreshold: 500, costPerUnit: 0.3, isActive: true, isLow: false, usedBy: [] });
    chicken.id = res.body.id;
    const [movement] = (await request(app).get(`/api/raw-materials/movements?rawMaterialId=${chicken.id}`).set(as(admin))).body;
    expect(movement).toMatchObject({ type: "restock", reason: "restock", delta: 2000, previousQty: 0, newQty: 2000, note: "Opening stock", adjustedByName: "Test Admin" });
  });

  it("creates a raw material with no opening stock and logs nothing", async () => {
    const res = await createMaterial({ name: sauce.name, unit: "ml", minStockThreshold: 100 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ stockQty: 0, isLow: true });
    sauce.id = res.body.id;
    expect((await request(app).get(`/api/raw-materials/movements?rawMaterialId=${sauce.id}`).set(as(admin))).body).toEqual([]);
  });

  it("refuses a second raw material with the same name", async () => {
    const res = await createMaterial({ name: chicken.name, unit: "g" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("A raw material with that name already exists");
  });

  it.each([
    ["no name", { unit: "g" }],
    ["an unknown unit", { name: "RM Test Flour", unit: "kg" }],
    ["a negative minimum level", { name: "RM Test Flour", unit: "g", minStockThreshold: -1 }],
    ["negative opening stock", { name: "RM Test Flour", unit: "g", stockQty: -5 }],
  ])("rejects a raw material with %s", async (_label, body) => {
    const res = await createMaterial(body);

    expect(res.status).toBe(400);
  });

  it("edits the name, minimum level and cost, but never the unit", async () => {
    const res = await request(app).put(`/api/raw-materials/${sauce.id}`).set(as(admin)).send({ name: "RM Test Soy Sauce", minStockThreshold: 50, costPerUnit: 0.05, unit: "g" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "RM Test Soy Sauce", minStockThreshold: 50, costPerUnit: 0.05, unit: "ml" });
    sauce.name = "RM Test Soy Sauce";
  });

  it("returns 404 for a raw material that does not exist, including a malformed id", async () => {
    const missing = await request(app).put(`/api/raw-materials/${MISSING_ID}`).set(as(admin)).send({ minStockThreshold: 1 });
    const malformed = await request(app).put("/api/raw-materials/not-an-id").set(as(admin)).send({ minStockThreshold: 1 });

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
  });
});

describe("who can do what", () => {
  it("lets staff see the list, without the cost per unit", async () => {
    const res = await request(app).get("/api/raw-materials").set(as(staff));

    expect(res.status).toBe(200);
    expect(res.body.find((m: { id: string }) => m.id === chicken.id)).not.toHaveProperty("costPerUnit");
  });

  it("shows the cost per unit to the admin", async () => {
    const list = await listAs(admin);

    expect(list.find((m) => m.id === chicken.id)).toHaveProperty("costPerUnit", 0.3);
  });

  it("blocks staff from adding or editing a raw material", async () => {
    const add = await createMaterial({ name: "RM Test Staff Item", unit: "g" }, staff);
    const edit = await request(app).put(`/api/raw-materials/${chicken.id}`).set(as(staff)).send({ minStockThreshold: 0 });

    expect(add.status).toBe(403);
    expect(edit.status).toBe(403);
  });

  it("blocks kiosk customers and visitors who are not signed in", async () => {
    const kiosk = await request(app).get("/api/raw-materials").set(as(customer));
    const anonymous = await request(app).get("/api/raw-materials");
    const kioskAdjust = await adjust(chicken.id, { delta: 1, reason: "restock" }, customer);

    expect(kiosk.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(kioskAdjust.status).toBe(403);
  });
});

describe("restocking and adjusting (Staff)", () => {
  it("adds a delivery and logs it with the reason, note, and staff name", async () => {
    const res = await adjust(sauce.id, { delta: 750, reason: "restock", note: "Supplier delivery" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stockQty: 750, isLow: false });
    const [movement] = (await request(app).get(`/api/raw-materials/movements?rawMaterialId=${sauce.id}`).set(as(staff))).body;
    expect(movement).toMatchObject({ type: "restock", reason: "restock", delta: 750, previousQty: 0, newQty: 750, note: "Supplier delivery", adjustedByName: "Test Staff" });
  });

  it("sets a counted amount and logs the difference as an adjustment", async () => {
    const res = await adjust(sauce.id, { setQty: 700, reason: "correction" });

    expect(res.body.stockQty).toBe(700);
    const [movement] = (await request(app).get(`/api/raw-materials/movements?rawMaterialId=${sauce.id}`).set(as(staff))).body;
    expect(movement).toMatchObject({ type: "adjustment", reason: "correction", delta: -50, previousQty: 750, newQty: 700 });
  });

  it("keeps amounts to three decimal places", async () => {
    await adjust(sauce.id, { delta: -0.125, reason: "spoilage" });

    expect(await stockOf(sauce.id)).toBe(699.875);
    await adjust(sauce.id, { delta: 0.125, reason: "correction" });
  });

  it("refuses to remove more than is on hand, changing and logging nothing", async () => {
    const logBefore = (await request(app).get(`/api/raw-materials/movements?rawMaterialId=${sauce.id}`).set(as(staff))).body.length;

    const res = await adjust(sauce.id, { delta: -701, reason: "spoilage" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("only 700 ml left");
    expect(await stockOf(sauce.id)).toBe(700);
    expect((await request(app).get(`/api/raw-materials/movements?rawMaterialId=${sauce.id}`).set(as(staff))).body).toHaveLength(logBefore);
  });

  it.each([
    ["no reason", { delta: 5 }],
    ["both a count and a change", { setQty: 5, delta: 5, reason: "correction" }],
    ["neither a count nor a change", { reason: "correction" }],
    ["a change of zero", { delta: 0, reason: "correction" }],
    ["a negative count", { setQty: -1, reason: "correction" }],
    ["an unknown reason", { delta: 5, reason: "gift" }],
  ])("rejects an adjustment with %s", async (_label, body) => {
    const res = await adjust(sauce.id, body);

    expect(res.status).toBe(400);
  });

  it.each([
    ["an increase for spoilage", { delta: 10, reason: "spoilage" }],
    ["an increase for damaged goods", { delta: 10, reason: "damaged" }],
    ["a higher counted amount for spoilage", { setQty: 800, reason: "spoilage" }],
    ["the same counted amount for damaged goods", { setQty: 700, reason: "damaged" }],
  ])("refuses %s, changing and logging nothing", async (_label, body) => {
    const logBefore = (await request(app).get(`/api/raw-materials/movements?rawMaterialId=${sauce.id}`).set(as(staff))).body.length;

    const res = await adjust(sauce.id, body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Damaged goods and spoilage can only lower the stock");
    expect(await stockOf(sauce.id)).toBe(700);
    expect((await request(app).get(`/api/raw-materials/movements?rawMaterialId=${sauce.id}`).set(as(staff))).body).toHaveLength(logBefore);
  });

  it("returns 404 when adjusting a raw material that does not exist", async () => {
    const res = await adjust(MISSING_ID, { delta: 1, reason: "restock" });

    expect(res.status).toBe(404);
  });

  it("flags a raw material as low once it reaches its minimum level", async () => {
    await adjust(sauce.id, { setQty: 50, reason: "correction" });

    const listed = (await listAs(staff)).find((m) => m.id === sauce.id);

    expect(listed).toMatchObject({ stockQty: 50, isLow: true });
    await adjust(sauce.id, { setQty: 700, reason: "correction" });
  });
});

describe("giving a dish a recipe (Administrator)", () => {
  const recipe = () => [
    { rawMaterialId: chicken.id, qtyPerServing: 200 },
    { rawMaterialId: sauce.id, qtyPerServing: 30 },
  ];

  it("creates a recipe dish whose stock is the servings the raw materials can make", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(as(admin))
      .send({ name: "RM Test Chicken Sizzler", price: 199, categoryId, tracking: "recipe", recipe: recipe() });

    expect(res.status).toBe(201);
    // 2000 g / 200 g = 10 servings of chicken, 700 ml / 30 ml = 23 of sauce: chicken limits it.
    expect(res.body).toMatchObject({ tracking: "recipe", stockQty: 10, isAvailable: true });
    expect(res.body.recipe).toEqual([
      { rawMaterialId: chicken.id, rawMaterialName: chicken.name, unit: "g", qtyPerServing: 200 },
      { rawMaterialId: sauce.id, rawMaterialName: sauce.name, unit: "ml", qtyPerServing: 30 },
    ]);
    dishId = res.body.id;
  });

  it("lists the dish under each raw material it uses", async () => {
    const listed = (await listAs(admin)).find((m) => m.id === chicken.id) as unknown as { usedBy: unknown[] };

    expect(listed.usedBy).toEqual([{ productId: dishId, productName: "RM Test Chicken Sizzler", qtyPerServing: 200 }]);
  });

  it("shows the recipe to the admin only", async () => {
    expect(await product(dishId, admin)).toHaveProperty("recipe");
    expect(await product(dishId, staff)).not.toHaveProperty("recipe");
    expect(await product(dishId)).not.toHaveProperty("recipe");
  });

  it.each([
    ["an empty recipe", { tracking: "recipe", recipe: [] }, 400],
    ["no recipe at all", { tracking: "recipe" }, 400],
    ["the same raw material twice", { tracking: "recipe", recipe: [{ rawMaterialId: MISSING_ID, qtyPerServing: 1 }, { rawMaterialId: MISSING_ID, qtyPerServing: 2 }] }, 400],
    ["an amount of zero", { tracking: "recipe", recipe: [{ rawMaterialId: MISSING_ID, qtyPerServing: 0 }] }, 400],
    ["a recipe on a unit-counted product", { tracking: "unit", recipe: [{ rawMaterialId: MISSING_ID, qtyPerServing: 1 }] }, 400],
    ["a raw material that does not exist", { tracking: "recipe", recipe: [{ rawMaterialId: MISSING_ID, qtyPerServing: 1 }] }, 404],
  ])("refuses a new product with %s", async (_label, extra, status) => {
    const res = await request(app).post("/api/products").set(as(admin)).send({ name: "RM Test Bad Dish", price: 100, categoryId, ...extra });

    expect(res.status).toBe(status);
  });

  it("blocks staff from changing a recipe", async () => {
    const res = await request(app).put(`/api/products/${dishId}`).set(as(staff)).send({ recipe: recipe() });

    expect(res.status).toBe(403);
  });

  it("replaces the recipe when the admin saves a new one", async () => {
    const res = await request(app).put(`/api/products/${dishId}`).set(as(admin)).send({ recipe: [{ rawMaterialId: chicken.id, qtyPerServing: 250 }] });

    expect(res.status).toBe(200);
    expect(res.body.recipe).toHaveLength(1);
    expect(res.body.stockQty).toBe(8); // 2000 g / 250 g
    await request(app).put(`/api/products/${dishId}`).set(as(admin)).send({ recipe: recipe() });
  });

  it("refuses a direct stock count on a recipe dish, pointing to its raw materials", async () => {
    const res = await request(app).patch(`/api/inventory/${dishId}`).set(as(staff)).send({ delta: 5, reason: "restock" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Raw materials page");
  });

  it("switches a recipe product back to counting units, dropping its recipe", async () => {
    const created = await request(app)
      .post("/api/products")
      .set(as(admin))
      .send({ name: "RM Test Switch Dish", price: 50, categoryId, tracking: "recipe", recipe: [{ rawMaterialId: sauce.id, qtyPerServing: 10 }] });

    const res = await request(app).put(`/api/products/${created.body.id}`).set(as(admin)).send({ tracking: "unit", stockQty: 12 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tracking: "unit", stockQty: 12, isAvailable: true });
    expect(res.body).not.toHaveProperty("recipe");
    expect(await prisma.recipeItem.count({ where: { productId: created.body.id } })).toBe(0);
  });

  it("keeps an unrelated unit product counting its own stock", async () => {
    expect(await product(PRODUCTS.sisig.id)).toMatchObject({ tracking: "unit" });
  });
});

describe("the kiosk's sold-out state follows the raw materials", () => {
  it("marks the dish sold out when an ingredient can't make one more serving", async () => {
    await adjust(chicken.id, { setQty: 150, reason: "spoilage" });

    expect(await product(dishId)).toMatchObject({ isAvailable: false, stockQty: 0 });
  });

  it("does not list a sold-out recipe dish as a low-stock product (its raw materials are)", async () => {
    const lowProducts = (await request(app).get("/api/inventory/low-stock").set(as(staff))).body.map((p: { id: string }) => p.id);
    const lowMaterials = (await listAs(staff)).filter((m) => (m as unknown as { isLow: boolean }).isLow).map((m) => m.id);

    expect(lowProducts).not.toContain(dishId);
    expect(lowMaterials).toContain(chicken.id);
  });

  it("brings the dish back as soon as the ingredient is restocked", async () => {
    await adjust(chicken.id, { delta: 1850, reason: "restock" });

    expect(await product(dishId)).toMatchObject({ isAvailable: true, stockQty: 10 });
  });

  it("deducts the recipe when a counter order is paid and logs a sale with the order number", async () => {
    const order = await request(app).post("/api/orders").set(as(customer)).send({ items: [{ productId: dishId, qty: 2 }], paymentMethod: "counter" });
    expect(order.status).toBe(201);

    const confirm = await request(app).post(`/api/payments/counter/${order.body.id}/confirm`).set(as(staff));

    expect(confirm.status).toBe(200);
    expect(await stockOf(chicken.id)).toBe(2000 - 2 * 200);
    expect(await stockOf(sauce.id)).toBe(700 - 2 * 30);
    const [sale] = (await request(app).get(`/api/raw-materials/movements?rawMaterialId=${chicken.id}`).set(as(staff))).body;
    expect(sale).toMatchObject({ type: "sale", reason: null, delta: -400, orderNumber: order.body.orderNumber, adjustedByName: null });
    expect(await product(dishId)).toMatchObject({ stockQty: 8 });
  });
});

describe("taking a raw material out of use", () => {
  it("keeps it in the list, marked as not in use", async () => {
    const res = await request(app).put(`/api/raw-materials/${sauce.id}`).set(as(admin)).send({ isActive: false });

    expect(res.body.isActive).toBe(false);
    expect((await listAs(staff)).find((m) => m.id === sauce.id)).toMatchObject({ isActive: false });
  });
});
