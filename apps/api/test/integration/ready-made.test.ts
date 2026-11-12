import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { CATEGORY } from "./fixtures";
import { app, loginAs, plentifulRecipe } from "./helpers";

// The built-in Ready-made category: items sold as they are (Coke Kasalo, bottled iced
// tea) have no recipe and are counted in pieces, with a minimum, while every other dish
// needs its bill of materials. The migration adds the category; the test database is
// emptied before each run, so it's made here and removed again afterwards.

let admin: string;
let staff: string;
let readyMadeId: number;
let dishCategoryId: number;
const madeProducts: string[] = [];

beforeAll(async () => {
  admin = await loginAs("admin");
  staff = await loginAs("staff");
  readyMadeId = (await prisma.category.create({ data: { name: "Ready-made", icon: "🥤", sortOrder: 99, isReadyMade: true } })).id;
  dishCategoryId = (await prisma.category.findFirstOrThrow({ where: { name: CATEGORY.name } })).id;
});

afterAll(async () => {
  await prisma.stockAdjustment.deleteMany({ where: { productId: { in: madeProducts } } });
  await prisma.product.deleteMany({ where: { id: { in: madeProducts } } });
  await prisma.category.delete({ where: { id: readyMadeId } });
});

const auth = (token = admin) => ({ Authorization: `Bearer ${token}` });

async function create(body: Record<string, unknown>) {
  const res = await request(app).post("/api/products").set(auth()).send({ price: 45, categoryId: readyMadeId, ...body });
  if (res.status === 201) madeProducts.push(res.body.id);
  return res;
}

const update = (id: string, body: object) => request(app).put(`/api/products/${id}`).set(auth()).send(body);

describe("ready-made items", () => {
  it("are created without a recipe and counted in pieces", async () => {
    const res = await create({ name: "Test Coke Kasalo", stockQty: 24, minStockThreshold: 6 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      tracking: "unit",
      stockQty: 24,
      minStockThreshold: 6,
      isAvailable: true,
      prepMinutes: 0,
      category: { id: readyMadeId, isReadyMade: true },
    });
    expect(res.body.recipe).toBeUndefined();
  });

  it("start at 0 pieces, and so sold out, when no count is given", async () => {
    const res = await create({ name: "Test Bottled Iced Tea" });

    expect(res.body).toMatchObject({ stockQty: 0, minStockThreshold: 0, isAvailable: false });
  });

  it("refuse a recipe", async () => {
    const res = await create({ name: "Test Recipe Soda", recipe: await plentifulRecipe("Ready-made") });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ready-made items are counted in pieces, so they don't take a recipe");
  });

  it("are restocked with Adjust stock, which logs the reason", async () => {
    const item = (await create({ name: "Test Restock Soda", stockQty: 2, minStockThreshold: 5 })).body;

    const res = await request(app).patch(`/api/inventory/${item.id}`).set(auth(staff)).send({ delta: 10, reason: "restock" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stockQty: 12, isAvailable: true });
    const log = await request(app).get(`/api/inventory/adjustments?productId=${item.id}`).set(auth(staff));
    expect(log.body[0]).toMatchObject({ delta: 10, previousQty: 2, newQty: 12, reason: "restock" });
  });

  it("show in the low-stock list at or below their minimum", async () => {
    const item = (await create({ name: "Test Low Soda", stockQty: 3, minStockThreshold: 3 })).body;

    const low = await request(app).get("/api/inventory/low-stock").set(auth(staff));

    expect(low.body.map((p: { id: string }) => p.id)).toContain(item.id);
  });

  it("can have their piece count and minimum changed from the product form", async () => {
    const item = (await create({ name: "Test Form Soda", stockQty: 5 })).body;

    const res = await update(item.id, { stockQty: 0, minStockThreshold: 4 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stockQty: 0, minStockThreshold: 4, isAvailable: false });
  });

  it("keep their pieces when an edit doesn't send a count", async () => {
    const item = (await create({ name: "Test Keep Soda", stockQty: 9 })).body;

    const res = await update(item.id, { price: 50 });

    expect(res.body).toMatchObject({ price: 50, stockQty: 9, tracking: "unit" });
  });

  it("drop a dish's recipe when the dish moves into Ready-made", async () => {
    const dish = await request(app)
      .post("/api/products")
      .set(auth())
      .send({ name: "Test Moving Drink", price: 45, categoryId: dishCategoryId, recipe: await plentifulRecipe("Moving") });
    madeProducts.push(dish.body.id);

    const res = await update(dish.body.id, { categoryId: readyMadeId, stockQty: 8 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tracking: "unit", stockQty: 8, isAvailable: true });
    expect(await prisma.recipeItem.count({ where: { productId: dish.body.id } })).toBe(0);
  });

  it("need a recipe to move out of Ready-made into a dish category", async () => {
    const item = (await create({ name: "Test Leaving Soda", stockQty: 4 })).body;

    const without = await update(item.id, { categoryId: dishCategoryId });
    const withRecipe = await update(item.id, { categoryId: dishCategoryId, recipe: await plentifulRecipe("Leaving", 2) });

    expect(without.status).toBe(400);
    expect(without.body.error).toBe("A dish needs at least one raw material in its recipe");
    expect(withRecipe.status).toBe(200);
    expect(withRecipe.body).toMatchObject({ tracking: "recipe", stockQty: 50_000 });
  });
});

describe("the Ready-made category", () => {
  it("is marked on the category list", async () => {
    const res = await request(app).get("/api/categories");

    expect(res.body.find((c: { id: number }) => c.id === readyMadeId)).toMatchObject({ name: "Ready-made", isReadyMade: true });
    expect(res.body.find((c: { name: string }) => c.name === CATEGORY.name)).toMatchObject({ isReadyMade: false });
  });

  it("keeps its name, but its icon can change", async () => {
    const rename = await request(app).put(`/api/categories/${readyMadeId}`).set(auth()).send({ name: "Drinks" });
    const icon = await request(app).put(`/api/categories/${readyMadeId}`).set(auth()).send({ name: "Ready-made", icon: "🧃" });

    expect(rename.status).toBe(409);
    expect(icon.status).toBe(200);
    expect(icon.body).toMatchObject({ name: "Ready-made", icon: "🧃", isReadyMade: true });
  });

  it("can't be deleted", async () => {
    const res = await request(app).delete(`/api/categories/${readyMadeId}`).set(auth());

    expect(res.status).toBe(409);
    expect(await prisma.category.count({ where: { id: readyMadeId } })).toBe(1);
  });

  it("can't be made by adding a category", async () => {
    const res = await request(app).post("/api/categories").set(auth()).send({ name: "Test Second Ready-made", isReadyMade: true });

    expect(res.status).toBe(201);
    expect(res.body.isReadyMade).toBe(false);
    await prisma.category.delete({ where: { id: res.body.id } });
  });
});

describe("bulk import with ready-made items", () => {
  const importCsv = (csvText: string, recipesCsvText = "", dryRun = true) =>
    request(app).post("/api/products/bulk-import").set(auth()).send({ csvText, recipesCsvText, dryRun });

  it("adds a ready-made item without recipe rows", async () => {
    const res = await importCsv("name,category,price\nTest Imported Soda,Ready-made,40", "", false);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, errors: 0 });
    const saved = await prisma.product.findFirstOrThrow({ where: { name: "Test Imported Soda" }, include: { inventory: true } });
    madeProducts.push(saved.id);
    expect(saved).toMatchObject({ tracking: "unit", isAvailable: false, inventory: { stockQty: 0 } });
  });

  it("refuses recipe rows for a ready-made item", async () => {
    const [material] = await plentifulRecipe("Import");
    const name = (await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.rawMaterialId } })).name;

    const res = await importCsv("name,category,price\nTest Recipe Import Soda,Ready-made,40", `product,rawMaterial,qtyPerServing\nTest Recipe Import Soda,${name},1`);

    expect(res.body.recipes.results[0]).toMatchObject({ status: "error", message: "Ready-made items are counted in pieces, so they don't take a recipe" });
    expect(res.body.results[0]).toMatchObject({ status: "error", message: "Fix this dish's rows in Recipes first" });
  });
});
