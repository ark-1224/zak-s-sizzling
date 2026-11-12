import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { CATEGORY, PRODUCTS } from "./fixtures";
import { app, loginAs, plentifulRecipe } from "./helpers";

let staffToken: string;

beforeAll(async () => {
  staffToken = await loginAs("staff");
});

describe("GET /api/products", () => {
  it("lists the catalog without signing in, with category and stock", async () => {
    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    // Every seeded product is listed (other test files may add products of their own).
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining(Object.values(PRODUCTS).map((p) => p.id)));
    const sisig = res.body.find((p: { id: string }) => p.id === PRODUCTS.sisig.id);
    expect(sisig).toMatchObject({
      name: PRODUCTS.sisig.name,
      isAvailable: true,
      stockQty: PRODUCTS.sisig.stockQty,
      category: { name: CATEGORY.name },
    });
    expect(Number(sisig.price)).toBe(Number(PRODUCTS.sisig.price));
  });

  it("marks a product with no stock as unavailable", async () => {
    const res = await request(app).get("/api/products");

    const calamares = res.body.find((p: { id: string }) => p.id === PRODUCTS.calamares.id);
    expect(calamares).toMatchObject({ isAvailable: false, stockQty: 0 });
  });
});

describe("GET /api/products/:id", () => {
  it("returns one product", async () => {
    const res = await request(app).get(`/api/products/${PRODUCTS.sisig.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: PRODUCTS.sisig.id, name: PRODUCTS.sisig.name });
  });

  it("returns 404 for a valid id that doesn't exist", async () => {
    const res = await request(app).get("/api/products/99999999-9999-4999-8999-999999999999");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Product not found");
  });

  // Regression test for defect D-01: a malformed id used to reach Prisma, which threw
  // on the invalid UUID, so the API answered 500 instead of 404.
  it("returns 404 for a malformed id", async () => {
    const res = await request(app).get("/api/products/not-a-uuid");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Product not found");
  });

  it("returns 404 for a malformed id when editing or deleting, too", async () => {
    const adminToken = await loginAs("admin");

    const edit = await request(app).put("/api/products/not-a-uuid").set("Authorization", `Bearer ${adminToken}`).send({ price: 10 });
    const remove = await request(app).delete("/api/products/not-a-uuid").set("Authorization", `Bearer ${adminToken}`);

    expect(edit.status).toBe(404);
    expect(remove.status).toBe(404);
  });
});

describe("GET /api/products/import-template", () => {
  // Regression test for defect D-02: "/:id" used to be registered before
  // "/import-template", so "import-template" was treated as a product id and failed with 500.
  it("downloads the CSV template for an admin", async () => {
    const adminToken = await loginAs("admin");
    const res = await request(app).get("/api/products/import-template").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text.split("\n")[0]).toContain("name");
  });

  it("keeps the template from staff and visitors who are not signed in", async () => {
    const staff = await request(app).get("/api/products/import-template").set("Authorization", `Bearer ${staffToken}`);
    const visitor = await request(app).get("/api/products/import-template");

    expect(staff.status).toBe(403);
    expect(visitor.status).toBe(401);
  });
});

describe("GET /api/categories", () => {
  it("lists categories without signing in", async () => {
    const res = await request(app).get("/api/categories");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ name: CATEGORY.name, sortOrder: CATEGORY.sortOrder })]);
  });
});

describe("DELETE /api/products/:id", () => {
  // Regression test for defect D-04 (found by access-matrix.test.ts): Prisma's "record
  // not found" error wasn't mapped, so this used to reach the generic 500.
  it("returns 404 for a product that does not exist", async () => {
    const adminToken = await loginAs("admin");

    const res = await request(app).delete("/api/products/99999999-9999-4999-8999-999999999999").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe("every dish is made from a bill of materials", () => {
  let adminToken: string;
  let categoryId: number;
  const create = (body: object) => request(app).post("/api/products").set("Authorization", `Bearer ${adminToken}`).send(body);
  const update = (id: string, body: object) => request(app).put(`/api/products/${id}`).set("Authorization", `Bearer ${adminToken}`).send(body);

  beforeAll(async () => {
    adminToken = await loginAs("admin");
    categoryId = (await request(app).get("/api/categories")).body[0].id;
  });

  it("refuses a new dish without a recipe, and saves nothing", async () => {
    const res = await create({ name: "No Recipe Dish", price: 100, categoryId });

    expect(res.status).toBe(400);
    const all = await request(app).get("/api/products");
    expect(all.body.some((p: { name: string }) => p.name === "No Recipe Dish")).toBe(false);
  });

  it("creates a dish whose stock is the servings its recipe makes, ignoring old stock and barcode fields", async () => {
    const res = await create({ name: "BOM Test Dish", price: 120, categoryId, recipe: await plentifulRecipe("BOM", 4), stockQty: 7, barcode: "480001" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tracking: "recipe", stockQty: 25_000, isAvailable: true });
    expect(res.body).not.toHaveProperty("barcode");
  });

  it("keeps a dish's recipe when an edit doesn't resend it", async () => {
    const created = await create({ name: "BOM Keep Dish", price: 120, categoryId, recipe: await plentifulRecipe("BOM keep") });

    const res = await update(created.body.id, { price: 130 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ price: 130, stockQty: 100_000 });
    expect(res.body.recipe).toHaveLength(1);
  });

  it("only lets a dish saved before bill of materials (no recipe) be edited along with a recipe", async () => {
    const res = await update(PRODUCTS.calamares.id, { name: "Renamed Calamares" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A dish needs at least one raw material in its recipe");
    const after = await request(app).get(`/api/products/${PRODUCTS.calamares.id}`);
    expect(after.body.name).toBe(PRODUCTS.calamares.name);
  });

  it("refuses an empty recipe on an edit", async () => {
    const created = await create({ name: "BOM Empty Dish", price: 120, categoryId, recipe: await plentifulRecipe("BOM empty") });

    const res = await update(created.body.id, { recipe: [] });

    expect(res.status).toBe(400);
  });
});

describe("special instructions per dish", () => {
  let adminToken: string;
  let categoryId: number;

  beforeAll(async () => {
    adminToken = await loginAs("admin");
    categoryId = (await request(app).get("/api/categories")).body[0].id;
  });

  const create = async (extra: object) =>
    request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `Instructions Dish ${Math.random()}`, price: 99, categoryId, recipe: await plentifulRecipe("Instructions"), ...extra });

  it("saves the dish's options and switch, and the kiosk receives them", async () => {
    const created = await create({ instructionOptions: ["No onions", "Extra rice"], allowInstructions: true });

    const kiosk = await request(app).get(`/api/products/${created.body.id}`);

    expect(kiosk.body).toMatchObject({ instructionOptions: ["No onions", "Extra rice"], allowInstructions: true });
  });

  it("can switch special instructions off for a dish", async () => {
    const created = await create({ allowInstructions: false });

    expect(created.body).toMatchObject({ allowInstructions: false, instructionOptions: [] });
  });

  it.each([
    ["more than 8 options", Array.from({ length: 9 }, (_, i) => `Option ${i}`)],
    ["the same option twice, in any letter case", ["No onions", "no onions"]],
    ["an option over 30 characters", ["x".repeat(31)]],
    ["an empty option", ["  "]],
  ])("refuses %s", async (_label, instructionOptions) => {
    const res = await create({ instructionOptions });

    expect(res.status).toBe(400);
  });
});
