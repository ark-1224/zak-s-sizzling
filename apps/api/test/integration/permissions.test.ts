import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { PRODUCTS } from "./fixtures";
import { app, loginAs } from "./helpers";

// Role split: product management (including prices and bulk import) and reports are
// Administrator-only; Staff keep inventory, orders, payments, and the kitchen display.
// The admin checks send invalid bodies so they prove the role check passes (400 from
// validation, not 403) without writing to the shared test database.

let admin: string;
let staff: string;

beforeAll(async () => {
  admin = await loginAs("admin");
  staff = await loginAs("staff");
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("product management is admin-only", () => {
  it("blocks staff from adding a product", async () => {
    const res = await request(app).post("/api/products").set(as(staff)).send({});

    expect(res.status).toBe(403);
  });

  it("lets an admin past the role check when adding a product", async () => {
    const res = await request(app).post("/api/products").set(as(admin)).send({});

    expect(res.status).toBe(400);
  });

  it("blocks staff from editing a product or its price", async () => {
    const res = await request(app).put(`/api/products/${PRODUCTS.sisig.id}`).set(as(staff)).send({ price: 1 });

    expect(res.status).toBe(403);
  });

  it("blocks staff from deleting a product", async () => {
    const res = await request(app).delete(`/api/products/${PRODUCTS.sisig.id}`).set(as(staff));

    expect(res.status).toBe(403);
  });

  it("blocks staff from bulk importing products", async () => {
    const res = await request(app).post("/api/products/bulk-import").set(as(staff)).send({ csvText: "name,category,price" });

    expect(res.status).toBe(403);
  });
});

describe("reports are admin-only", () => {
  const reports = ["/api/reports/sales?range=weekly", "/api/reports/top-products", "/api/reports/inventory-movement", "/api/reports/profitability"];

  it.each(reports)("blocks staff from %s", async (path) => {
    const res = await request(app).get(path).set(as(staff));

    expect(res.status).toBe(403);
  });

  it.each(reports)("lets an admin read %s", async (path) => {
    const res = await request(app).get(path).set(as(admin));

    expect(res.status).toBe(200);
  });

  it("blocks staff from exporting a report", async () => {
    const res = await request(app).get("/api/reports/export?type=sales&format=csv").set(as(staff));

    expect(res.status).toBe(403);
  });
});

describe("staff keep their day-to-day functions", () => {
  it.each(["/api/inventory/low-stock", "/api/inventory/adjustments", "/api/orders", "/api/kitchen/tasks"])("lets staff read %s", async (path) => {
    const res = await request(app).get(path).set(as(staff));

    expect(res.status).toBe(200);
  });

  it("lets staff look up a product by barcode", async () => {
    const res = await request(app).get(`/api/products/barcode/${PRODUCTS.sisig.barcode}`).set(as(staff));

    expect(res.status).toBe(200);
  });
});
