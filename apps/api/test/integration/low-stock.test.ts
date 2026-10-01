import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
// The worker's hourly job, run directly. Its Prisma client reads the same DATABASE_URL,
// which vitest.config.mts has pointed at the *_test database.
import { lowStockSweep } from "../../../worker/src/jobs/lowStockSweep";
import { PRODUCTS } from "./fixtures";
import { app, loginAs } from "./helpers";

// Raw materials in the low-stock logic (Stock per raw material, session 4/4). Test files
// share one database and run in no fixed order, so this file creates its own raw
// materials and dishes rather than relying on the seeded ones' current stock.

let admin: string;
const ids = { flour: "", salt: "", oldSpice: "", bread: "", toast: "" };

beforeAll(async () => {
  admin = await loginAs("admin");
  const { id: categoryId } = await prisma.category.findFirstOrThrow();

  const material = (name: string, stockQty: number, minStockThreshold: number, isActive = true) =>
    prisma.rawMaterial.create({ data: { name, unit: "g", stockQty, minStockThreshold, isActive } });
  ids.flour = (await material("LS Test Flour", 100, 500)).id; // below its minimum
  ids.salt = (await material("LS Test Salt", 1000, 100)).id; // comfortably above
  ids.oldSpice = (await material("LS Test Old Spice", 0, 10, false)).id; // empty, but not in use

  // Recipe dishes keep an inventory row; give them a stale count so a test can tell
  // whether it's used (it shouldn't be) or the servings from the recipe are.
  const dish = (name: string, materialId: string, qtyPerServing: number) =>
    prisma.product.create({
      data: {
        name,
        price: 50,
        categoryId,
        tracking: "recipe",
        inventory: { create: { stockQty: 25, minStockThreshold: 30 } },
        recipeItems: { create: [{ rawMaterialId: materialId, qtyPerServing }] },
      },
    });
  ids.bread = (await dish("LS Test Bread", ids.flour, 200)).id; // 100 g / 200 g = 0 servings
  ids.toast = (await dish("LS Test Toast", ids.salt, 100)).id; // 1000 g / 100 g = 10 servings
});

describe("the hourly low-stock check (worker)", () => {
  let low: Awaited<ReturnType<typeof lowStockSweep>>;

  beforeAll(async () => {
    low = await lowStockSweep();
  });

  it("lists a raw material at or below its minimum, with its unit", () => {
    expect(low).toContainEqual({ kind: "raw material", name: "LS Test Flour", stockQty: 100, minStockThreshold: 500, unit: "g" });
  });

  it("still lists unit-counted products at or below their minimum", () => {
    expect(low).toContainEqual(expect.objectContaining({ kind: "product", name: PRODUCTS.calamares.name, stockQty: 0 }));
  });

  it("leaves out raw materials above their minimum and raw materials not in use", () => {
    const names = low.map((item) => item.name);

    expect(names).not.toContain("LS Test Salt");
    expect(names).not.toContain("LS Test Old Spice");
  });

  it("leaves out recipe dishes, which run low through their raw materials", () => {
    const names = low.map((item) => item.name);

    expect(names).not.toContain("LS Test Bread");
    expect(names).not.toContain("LS Test Toast");
  });
});

describe("the inventory movement report", () => {
  it("shows a recipe dish's current stock as the servings its raw materials can make", async () => {
    const res = await request(app).get("/api/reports/inventory-movement").set("Authorization", `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const row = (name: string) => res.body.find((r: { productName: string }) => r.productName === name);
    expect(row("LS Test Toast")).toMatchObject({ currentStock: 10, qtySold: 0 });
    expect(row("LS Test Bread")).toMatchObject({ currentStock: 0 });
  });

  it("still shows a unit-counted product's own count", async () => {
    const res = await request(app).get("/api/reports/inventory-movement").set("Authorization", `Bearer ${admin}`);
    const { stockQty } = await prisma.inventory.findUniqueOrThrow({ where: { productId: PRODUCTS.calamares.id } });

    expect(res.body.find((r: { productId: string }) => r.productId === PRODUCTS.calamares.id)).toMatchObject({ currentStock: stockQty });
  });

  it("exports the same servings in the CSV download", async () => {
    const res = await request(app).get("/api/reports/export?type=inventory-movement&format=csv").set("Authorization", `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("LS Test Toast,0,10");
  });
});

describe("what the dashboard reads", () => {
  it("flags the low raw material and leaves recipe dishes out of the low-stock product list", async () => {
    const materials = (await request(app).get("/api/raw-materials").set("Authorization", `Bearer ${admin}`)).body;
    const lowProducts = (await request(app).get("/api/inventory/low-stock").set("Authorization", `Bearer ${admin}`)).body.map((p: { id: string }) => p.id);

    expect(materials.find((m: { id: string }) => m.id === ids.flour)).toMatchObject({ isLow: true, isActive: true });
    expect(materials.find((m: { id: string }) => m.id === ids.salt)).toMatchObject({ isLow: false });
    expect(lowProducts).not.toContain(ids.bread);
    expect(lowProducts).not.toContain(ids.toast);
  });

  it("reports recipe dishes to the kiosk with servings left, not their stale count", async () => {
    const toast = (await request(app).get(`/api/products/${ids.toast}`)).body;
    const bread = (await request(app).get(`/api/products/${ids.bread}`)).body;

    expect(toast).toMatchObject({ tracking: "recipe", stockQty: 10 });
    expect(bread).toMatchObject({ tracking: "recipe", stockQty: 0 });
  });
});
