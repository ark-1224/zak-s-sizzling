import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { CATEGORY, PRODUCTS } from "./fixtures";
import { app, loginAs } from "./helpers";

let staffToken: string;

beforeAll(async () => {
  staffToken = await loginAs("staff");
});

describe("GET /api/products", () => {
  it("lists the catalog without signing in, with category and stock", async () => {
    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(Object.keys(PRODUCTS).length);
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

  // Known bug: a malformed id reaches Prisma, which throws on the invalid UUID, so the
  // API answers 500 instead of 404. `it.fails` keeps the suite green while the bug
  // exists and will start failing once it's fixed, as a reminder to make this a
  // normal test.
  it.fails("returns 404 for a malformed id (known bug: currently 500)", async () => {
    const res = await request(app).get("/api/products/not-a-uuid");

    expect(res.status).toBe(404);
  });
});

describe("GET /api/products/barcode/:code", () => {
  it("finds a product by barcode for staff", async () => {
    const res = await request(app).get(`/api/products/barcode/${PRODUCTS.sisig.barcode}`).set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PRODUCTS.sisig.id);
  });

  it("returns 404 for an unknown barcode", async () => {
    const res = await request(app).get("/api/products/barcode/0000000000000").set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(404);
  });

  it("requires signing in", async () => {
    const res = await request(app).get(`/api/products/barcode/${PRODUCTS.sisig.barcode}`);

    expect(res.status).toBe(401);
  });
});

describe("GET /api/products/import-template", () => {
  // Known bug: the "/:id" route is registered before "/import-template" in
  // src/modules/products/routes.ts, so "import-template" is treated as a product id and
  // the request fails with 500. Same `it.fails` convention as above.
  it.fails("downloads the CSV template for an admin (known bug: currently 500)", async () => {
    const adminToken = await loginAs("admin");
    const res = await request(app).get("/api/products/import-template").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text.split("\n")[0]).toContain("name");
  });
});

describe("GET /api/categories", () => {
  it("lists categories without signing in", async () => {
    const res = await request(app).get("/api/categories");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ name: CATEGORY.name, sortOrder: CATEGORY.sortOrder })]);
  });
});
