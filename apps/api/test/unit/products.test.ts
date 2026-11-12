import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The database layer and the product service are replaced with test doubles, so these
// tests exercise only the import's row checks and the DTO conversion.
vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    category: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    rawMaterial: { findMany: vi.fn() },
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
const drinks = { id: 5, name: "Drinks", icon: "🥤", sortOrder: 5, isNew: false, isReadyMade: false };
const readyMade = { id: 9, name: "Ready-made", icon: "🥤", sortOrder: 9, isNew: false, isReadyMade: true };
const tea = { id: "m-tea", name: "Iced tea powder", isActive: true };
const ice = { id: "m-ice", name: "Ice", isActive: true };
const cup = { id: "m-cup", name: "Cup", isActive: false };

/** Products already on the menu: [id, name, how many raw materials its recipe has, ready-made?]. */
function menu(...products: [string, string, number, boolean?][]) {
  mocked(prisma.product.findMany).mockResolvedValue(
    products.map(([id, name, count, isReadyMade = false]) => ({ id, name, category: { isReadyMade }, _count: { recipeItems: count } })) as never
  );
}

const teaRecipe = (product = "Iced Tea") => [
  { product, rawMaterial: "Iced tea powder", qtyPerServing: "20" },
  { product, rawMaterial: "Ice", qtyPerServing: "150" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocked(prisma.category.findMany).mockResolvedValue([drinks, readyMade] as never);
  mocked(prisma.rawMaterial.findMany).mockResolvedValue([tea, ice, cup] as never);
  menu();
});

describe("bulkImportProducts: dishes and their bills of materials", () => {
  it("creates a new dish with its recipe, matching the category and raw materials regardless of letter case", async () => {
    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "drinks", price: "45" }], {
      recipeRows: [
        { product: "iced tea", rawMaterial: "ICED TEA POWDER", qtyPerServing: "20" },
        { product: "Iced Tea", rawMaterial: "ice", qtyPerServing: "150" },
      ],
    });

    expect(summary).toMatchObject({ total: 1, created: 1, updated: 0, errors: 0, recipes: { total: 2, dishes: 1, errors: 0 } });
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Iced Tea",
        price: 45,
        categoryId: 5,
        recipe: [
          { rawMaterialId: "m-tea", qtyPerServing: 20 },
          { rawMaterialId: "m-ice", qtyPerServing: 150 },
        ],
      })
    );
  });

  it("refuses a new dish without a recipe, since its stock comes from one", async () => {
    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "Drinks", price: "45" }]);

    expect(summary.results[0]).toMatchObject({ status: "error", message: "A new dish needs its recipe: add its raw materials in Recipes" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("updates a dish whose name matches one on the menu, ignoring case and extra spaces, keeping its recipe", async () => {
    menu(["p-1", "Iced Tea", 2]);

    const summary = await bulkImportProducts([{ name: "  iced   TEA ", category: "Drinks", price: "50" }]);

    expect(summary).toMatchObject({ created: 0, updated: 1, errors: 0 });
    expect(updateProduct).toHaveBeenCalledWith("p-1", expect.objectContaining({ price: 50, recipe: undefined }));
  });

  it("refuses to update a dish that has no recipe yet unless the import gives it one", async () => {
    menu(["p-1", "Coke Kasalo", 0]);

    const without = await bulkImportProducts([{ name: "Coke Kasalo", category: "Drinks", price: "50" }], { dryRun: true });
    const withRecipe = await bulkImportProducts([{ name: "Coke Kasalo", category: "Drinks", price: "50" }], {
      dryRun: true,
      recipeRows: [{ product: "Coke Kasalo", rawMaterial: "Cup", qtyPerServing: "1" }],
    });

    expect(without.results[0]).toMatchObject({ status: "error", message: "This dish has no recipe yet: add its raw materials in Recipes" });
    expect(withRecipe.results[0].status).toBe("updated");
  });

  it("replaces the recipe of a dish on the menu that isn't in the Products table", async () => {
    menu(["p-1", "Iced Tea", 3]);

    const summary = await bulkImportProducts([], { recipeRows: teaRecipe() });

    expect(summary).toMatchObject({ total: 0, errors: 0, recipes: { dishes: 1 } });
    expect(updateProduct).toHaveBeenCalledWith("p-1", {
      recipe: [
        { rawMaterialId: "m-tea", qtyPerServing: 20 },
        { rawMaterialId: "m-ice", qtyPerServing: 150 },
      ],
    });
  });

  it("refuses a name listed twice in the Products table", async () => {
    const summary = await bulkImportProducts(
      [
        { name: "Iced Tea", category: "Drinks", price: "45" },
        { name: "iced tea", category: "Drinks", price: "50" },
      ],
      { dryRun: true, recipeRows: teaRecipe() }
    );

    expect(summary.results[1]).toMatchObject({ status: "error", message: 'Row 2 already lists "iced tea". List each dish once.' });
  });

  it("refuses to guess when two products on the menu share the name", async () => {
    menu(["p-1", "Iced Tea", 2], ["p-2", "Iced tea", 2]);

    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "Drinks", price: "45" }], { dryRun: true });

    expect(summary.results[0]).toMatchObject({ status: "error", message: expect.stringMatching(/More than one product is named "Iced Tea"/) });
  });
});

describe("bulkImportProducts: Recipes table checks", () => {
  async function recipeCheck(row: Record<string, string>) {
    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "Drinks", price: "45" }], {
      dryRun: true,
      recipeRows: [{ product: "Iced Tea", rawMaterial: "Ice", qtyPerServing: "150" }, row],
    });
    return summary;
  }

  it.each([
    ["an unknown raw material", { rawMaterial: "Sugar", qtyPerServing: "10" }, 'Unknown raw material "Sugar". Add it on the Raw materials page first.'],
    ["a missing raw material", { rawMaterial: "", qtyPerServing: "10" }, "Missing raw material"],
    ["an amount of 0", { rawMaterial: "Iced tea powder", qtyPerServing: "0" }, expect.stringMatching(/^Amount per serving must be a number above 0/)],
    ["an amount that isn't a number", { rawMaterial: "Iced tea powder", qtyPerServing: "a scoop" }, expect.stringMatching(/^Amount per serving/)],
    ["a raw material listed twice for the dish", { rawMaterial: "ice", qtyPerServing: "100" }, "Row 2 already lists Ice for this dish"],
  ])("rejects %s, and the dish with it rather than saving half a recipe", async (_label, change, message) => {
    const summary = await recipeCheck({ product: "Iced Tea", ...change });

    expect(summary.recipes.results[1]).toMatchObject({ row: 3, status: "error", message });
    expect(summary.results[0]).toMatchObject({ status: "error", message: "Fix this dish's rows in Recipes first" });
    expect(summary.errors).toBe(2);
  });

  it("rejects a recipe row for a dish that is neither in Products nor on the menu", async () => {
    const summary = await bulkImportProducts([], { dryRun: true, recipeRows: teaRecipe("Mango Shake") });

    expect(summary.recipes.results[0]).toMatchObject({ status: "error", message: 'No dish named "Mango Shake" in Products or on the menu' });
  });

  it("points recipe rows at their dish's error instead of repeating it", async () => {
    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "Desserts", price: "45" }], { dryRun: true, recipeRows: teaRecipe() });

    expect(summary.recipes.results[0]).toMatchObject({ status: "error", message: "Its dish (row 2 of Products) has an error" });
  });

  it("warns, without blocking, about a raw material marked not in use", async () => {
    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "Drinks", price: "45" }], {
      dryRun: true,
      recipeRows: [...teaRecipe(), { product: "Iced Tea", rawMaterial: "Cup", qtyPerServing: "1" }],
    });

    expect(summary).toMatchObject({ errors: 0, warnings: 1 });
    expect(summary.recipes.results[2]).toMatchObject({ status: "ok", warning: 'Cup is marked "not in use"; importing puts it back in use' });
  });
});

describe("bulkImportProducts: Products table checks", () => {
  it.each([
    ["a missing name", { name: "" }, "Missing product name"],
    ["an unknown category", { category: "Desserts" }, 'Unknown category "Desserts"'],
    ["a missing price", { price: "" }, "Price is required and must be a number"],
    ["a price that isn't a number", { price: "abc" }, "Price is required and must be a number"],
    ["a negative price", { price: "-5" }, "Price is required and must be a number"],
    ["a negative cost", { cost: "-10" }, "Cost must be a number of 0 or more if provided"],
    ["a cost that isn't a number", { cost: "cheap" }, "Cost must be a number of 0 or more if provided"],
    ["a name over 150 characters", { name: "x".repeat(151) }, "Product name is longer than 150 characters"],
  ])("rejects %s", async (_label, change, message) => {
    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "Drinks", price: "45", ...change }], { dryRun: true, recipeRows: teaRecipe() });

    expect(summary.results[0]).toMatchObject({ row: 2, status: "error", message });
  });

  it("ignores old columns such as barcode and stockQty", async () => {
    const summary = await bulkImportProducts([{ name: "Iced Tea", category: "Drinks", price: "45", barcode: "480001", stockQty: "-5" }], {
      dryRun: true,
      recipeRows: teaRecipe(),
    });

    expect(summary).toMatchObject({ created: 1, errors: 0 });
  });
});

describe("bulkImportProducts: ready-made items (counted in pieces, no recipe)", () => {
  it("creates a ready-made item without a recipe", async () => {
    const summary = await bulkImportProducts([{ name: "Coke Kasalo", category: "Ready-made", price: "35" }]);

    expect(summary).toMatchObject({ created: 1, errors: 0 });
    expect(createProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "Coke Kasalo", categoryId: 9, recipe: undefined }));
  });

  it("updates a ready-made item on the menu, which has no recipe", async () => {
    menu(["p-1", "Coke Kasalo", 0, true]);

    const summary = await bulkImportProducts([{ name: "Coke Kasalo", category: "Ready-made", price: "40" }], { dryRun: true });

    expect(summary.results[0].status).toBe("updated");
  });

  it("refuses recipe rows for a ready-made item, from the Products table or the menu", async () => {
    menu(["p-1", "Coke Kasalo", 0, true]);

    const fromTable = await bulkImportProducts([{ name: "Bottled Tea", category: "Ready-made", price: "40" }], {
      dryRun: true,
      recipeRows: teaRecipe("Bottled Tea"),
    });
    const fromMenu = await bulkImportProducts([], { dryRun: true, recipeRows: teaRecipe("Coke Kasalo") });

    for (const summary of [fromTable, fromMenu]) {
      expect(summary.recipes.results[0]).toMatchObject({ status: "error", message: "Ready-made items are counted in pieces, so they don't take a recipe" });
    }
    expect(fromTable.results[0]).toMatchObject({ status: "error", message: "Fix this dish's rows in Recipes first" });
  });

  it("needs a recipe to move a ready-made item into a dish category", async () => {
    menu(["p-1", "Coke Kasalo", 0, true]);

    const summary = await bulkImportProducts([{ name: "Coke Kasalo", category: "Drinks", price: "40" }], { dryRun: true });

    expect(summary.results[0]).toMatchObject({ status: "error", message: "This dish has no recipe yet: add its raw materials in Recipes" });
  });
});

describe("bulkImportProducts: preview and saving", () => {
  it("checks every row and saves nothing in a dry run", async () => {
    menu(["p-1", "Old Tea", 2]);

    const summary = await bulkImportProducts(
      [
        { name: "Iced Tea", category: "Drinks", price: "45" },
        { name: "Old Tea", category: "Drinks", price: "50" },
        { name: "Bad Tea", category: "Drinks", price: "abc" },
      ],
      { dryRun: true, recipeRows: teaRecipe() }
    );

    expect(summary).toMatchObject({ dryRun: true, total: 3, created: 1, updated: 1, errors: 1 });
    expect(summary.results.map((r) => r.status)).toEqual(["created", "updated", "error"]);
    expect(createProduct).not.toHaveBeenCalled();
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it("records a save failure on that row and continues with the next one", async () => {
    mocked(createProduct).mockRejectedValueOnce(new Error("Couldn't save"));

    const summary = await bulkImportProducts(
      [
        { name: "Iced Tea", category: "Drinks", price: "45" },
        { name: "Lemon Tea", category: "Drinks", price: "45" },
      ],
      { recipeRows: [...teaRecipe(), ...teaRecipe("Lemon Tea")] }
    );

    expect(summary.results[0]).toMatchObject({ status: "error", message: "Couldn't save" });
    expect(summary.results[1].status).toBe("created");
    expect(summary.dryRun).toBe(false);
  });
});

describe("toProductDTO", () => {
  const base = {
    id: "p-1",
    name: "Sizzling Sisig",
    price: new Prisma.Decimal("185.00"),
    cost: null,
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
    instructionOptions: ["No onions", "Extra spicy"],
    allowInstructions: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    inventory: { id: 1, productId: "p-1", stockQty: 12, minStockThreshold: 5, updatedAt: new Date() },
  };

  it("converts database decimals to plain numbers and flattens stock", () => {
    const dto = toProductDTO(base as never);

    expect(dto).toMatchObject({ price: 185, cost: null, stockQty: 12, minStockThreshold: 5, nutrition: { protein: 24.5, carbs: null } });
    expect(dto).not.toHaveProperty("barcode");
  });

  it("leaves stock undefined for a product without an inventory record", () => {
    const dto = toProductDTO({ ...base, inventory: null } as never);

    expect(dto.stockQty).toBeUndefined();
  });

  it("passes the special-instruction options through, and gives a recipe dish the servings its raw materials make", () => {
    const dto = toProductDTO({
      ...base,
      tracking: "recipe",
      recipeItems: [
        { rawMaterialId: "m-pork", qtyPerServing: new Prisma.Decimal("150"), rawMaterial: { name: "Pork", unit: "g", stockQty: new Prisma.Decimal("1000") } },
        { rawMaterialId: "m-onion", qtyPerServing: new Prisma.Decimal("20"), rawMaterial: { name: "Onion", unit: "g", stockQty: new Prisma.Decimal("50") } },
      ],
    } as never);

    expect(dto).toMatchObject({ instructionOptions: ["No onions", "Extra spicy"], allowInstructions: true, tracking: "recipe", stockQty: 2 });
    expect(dto.recipe).toHaveLength(2);
  });
});
