import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The database layer and the product service are replaced with test doubles, so these
// tests exercise only the import's row checks and the DTO conversion.
vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    category: { findMany: vi.fn() },
    product: { findUnique: vi.fn() },
  },
}));
vi.mock("../../src/modules/products/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/modules/products/service")>()),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
}));

import { prisma } from "../../src/lib/prisma";
import { bulkImportProducts } from "../../src/modules/products/bulkImport";
import { createProduct, toProductDTO, updateProduct } from "../../src/modules/products/service";

const mocked = vi.mocked;
const drinks = { id: 5, name: "Drinks", icon: "🥤", sortOrder: 5, isNew: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocked(prisma.category.findMany).mockResolvedValue([drinks] as never);
  mocked(prisma.product.findUnique).mockResolvedValue(null as never);
});

describe("bulkImportProducts row checks", () => {
  it("rejects a row without a product name", async () => {
    const summary = await bulkImportProducts([{ name: "", category: "Drinks", price: "45" }]);

    expect(summary.results[0]).toMatchObject({ row: 2, status: "error", message: "Missing product name" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("rejects a category that does not exist", async () => {
    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "Desserts", price: "45" }]);

    expect(summary.results[0]).toMatchObject({ status: "error", message: 'Unknown category "Desserts"' });
  });

  it("rejects a missing, non-numeric, or negative price", async () => {
    const summary = await bulkImportProducts([
      { name: "A", category: "Drinks", price: "" },
      { name: "B", category: "Drinks", price: "abc" },
      { name: "C", category: "Drinks", price: "-5" },
    ]);

    expect(summary.errors).toBe(3);
    expect(summary.results.every((r) => r.message === "Price is required and must be a number")).toBe(true);
  });

  it("rejects a non-numeric cost or stock quantity", async () => {
    const summary = await bulkImportProducts([
      { name: "A", category: "Drinks", price: "45", cost: "cheap" },
      { name: "B", category: "Drinks", price: "45", stockQty: "many" },
    ]);

    expect(summary.results.map((r) => r.message)).toEqual(["Cost must be a number if provided", "Stock quantities must be numbers if provided"]);
  });

  it("matches the category name regardless of letter case and creates a new product", async () => {
    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "drinks", price: "45" }]);

    expect(summary).toMatchObject({ total: 1, created: 1, updated: 0, errors: 0 });
    expect(createProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "Iced Tea", price: 45, categoryId: 5, stockQty: 0, minStockThreshold: 5 }));
  });

  it("updates the existing product when the barcode matches", async () => {
    mocked(prisma.product.findUnique).mockResolvedValue({ id: "p-1" } as never);

    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "Drinks", price: "50", barcode: "480001" }]);

    expect(summary).toMatchObject({ created: 0, updated: 1 });
    expect(updateProduct).toHaveBeenCalledWith("p-1", expect.objectContaining({ price: 50 }));
  });

  it("records a save failure on that row and continues with the next one", async () => {
    mocked(createProduct).mockRejectedValueOnce(new Error("Barcode already in use"));

    const summary = await bulkImportProducts([
      { name: "A", category: "Drinks", price: "45" },
      { name: "B", category: "Drinks", price: "45" },
    ]);

    expect(summary.results[0]).toMatchObject({ status: "error", message: "Barcode already in use" });
    expect(summary.results[1].status).toBe("created");
  });
});

describe("toProductDTO", () => {
  const base = {
    id: "p-1",
    name: "Sizzling Sisig",
    price: new Prisma.Decimal("185.00"),
    cost: null,
    barcode: null,
    categoryId: 1,
    category: { id: 1, name: "Sizzling Plates", icon: "🔥", sortOrder: 1, isNew: false },
    description: null,
    icon: "🔥",
    ingredients: ["Pork"],
    allergens: [],
    calories: null,
    proteinG: new Prisma.Decimal("24.50"),
    carbsG: null,
    sugarG: null,
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    inventory: { id: 1, productId: "p-1", stockQty: 12, minStockThreshold: 5, updatedAt: new Date() },
  };

  it("converts database decimals to plain numbers and flattens stock", () => {
    const dto = toProductDTO(base as never);

    expect(dto).toMatchObject({ price: 185, cost: null, stockQty: 12, minStockThreshold: 5, nutrition: { protein: 24.5, carbs: null } });
  });

  it("leaves stock undefined for a product without an inventory record", () => {
    const dto = toProductDTO({ ...base, inventory: null } as never);

    expect(dto.stockQty).toBeUndefined();
  });
});
