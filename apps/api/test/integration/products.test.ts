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
