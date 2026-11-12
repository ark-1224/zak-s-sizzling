import { prisma } from "../../lib/prisma";
import { createProduct, READY_MADE_NO_RECIPE, updateProduct, type RecipeInput } from "./service";
import type { BulkImportRecipeRowResult, BulkImportRowResult, BulkImportSummary } from "@zaks/shared-types";

// Bulk import of dishes and their bills of materials (panel feedback: every dish's stock
// comes from its recipe). Two tables, as two sheets of one Excel file or two CSV texts:
//
//   Products: name, category, price, cost, description
//   Recipes:  product, rawMaterial, qtyPerServing   (one row per raw material of a dish)
//
// Dishes are matched to existing products by name (ignoring letter case and spaces): a
// matching name updates that product, any other name creates one. A new dish must have
// its recipe in the same import. Recipe rows replace a dish's whole recipe, so they can
// also update the recipe of a dish that isn't in the Products table. Raw materials are
// matched by name and must already exist (Raw materials page).
//
// Items in the Ready-made category (bottled drinks sold as they are) are counted in
// pieces, so they take no recipe; their piece count is set on Raw materials > Ready-made.
//
// With `dryRun`, nothing is saved: every row is checked and reported as it would be
// imported, so the admin can fix the file first. The preview and the real import share
// these checks, so they always agree.

export const IMPORT_HEADERS = ["name", "category", "price", "cost", "description"] as const;
export const RECIPE_HEADERS = ["product", "rawMaterial", "qtyPerServing"] as const;

/** Header names compare without case, spaces, dashes or underscores ("Raw material" = rawMaterial). */
export const normaliseHeader = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/**
 * Re-keys parsed CSV rows by the expected header names, so "Raw material" or "qty per
 * serving" in a hand-made file still work. Columns that aren't expected are dropped.
 */
export function canonicalRows<H extends string>(rows: Record<string, string>[], headers: readonly H[]): Record<H, string>[] {
  const byKey = new Map(headers.map((h) => [normaliseHeader(h), h]));
  return rows.map((row) => {
    const out = {} as Record<H, string>;
    for (const [key, value] of Object.entries(row)) {
      const header = byKey.get(normaliseHeader(key));
      if (header && out[header] === undefined) out[header] = value;
    }
    return out;
  });
}

/** Product and raw-material names compare without letter case or extra spaces. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN; // NaN signals "present but invalid" vs undefined "absent"
}

interface ProductRow {
  row: number;
  key: string;
  name: string;
  categoryId: number;
  /** In the Ready-made category: counted in pieces, no recipe. */
  readyMade: boolean;
  price: number;
  cost?: number;
  description?: string;
  /** The existing product this row updates, if one has the same name. */
  existingId?: string;
}

interface RecipeLine {
  row: number;
  productKey: string;
  productName: string;
  rawMaterialId: string;
  qty: number;
}

type ExistingProduct = { id: string; name: string; recipeCount: number; readyMade: boolean };

/** Checks one Products row against the same limits as the product form. */
function checkProductRow(
  r: Partial<Record<(typeof IMPORT_HEADERS)[number], string>>,
  categoryByName: Map<string, { id: number; isReadyMade?: boolean }>,
): Omit<ProductRow, "row" | "key" | "existingId"> | { error: string; name?: string } {
  const name = r.name?.trim();
  if (!name) return { error: "Missing product name" };
  if (name.length > 150) return { error: "Product name is longer than 150 characters", name };

  const category = r.category ? categoryByName.get(nameKey(r.category)) : undefined;
  if (!category) return { error: `Unknown category "${r.category ?? ""}"`, name };

  const price = parseNumber(r.price);
  if (price === undefined || Number.isNaN(price) || price < 0) return { error: "Price is required and must be a number", name };

  const cost = parseNumber(r.cost);
  if (cost !== undefined && (Number.isNaN(cost) || cost < 0)) return { error: "Cost must be a number of 0 or more if provided", name };

  const description = r.description?.trim() || undefined;
  if (description && description.length > 2000) return { error: "Description is longer than 2000 characters", name };

  return { name, categoryId: category.id, readyMade: category.isReadyMade === true, price, cost, description };
}

export interface BulkImportOptions {
  dryRun?: boolean;
  /** Rows of the Recipes table (product, rawMaterial, qtyPerServing). */
  recipeRows?: Record<string, string>[];
}

export async function bulkImportProducts(rows: Record<string, string>[], { dryRun = false, recipeRows = [] }: BulkImportOptions = {}): Promise<BulkImportSummary> {
  const [categories, existingRows, materials] = await Promise.all([
    prisma.category.findMany(),
    prisma.product.findMany({ select: { id: true, name: true, category: { select: { isReadyMade: true } }, _count: { select: { recipeItems: true } } } }),
    prisma.rawMaterial.findMany({ select: { id: true, name: true, isActive: true } }),
  ]);
  const categoryByName = new Map(categories.map((c) => [nameKey(c.name), c]));
  const materialByName = new Map(materials.map((m) => [nameKey(m.name), m]));
  const existingByName = new Map<string, ExistingProduct[]>();
  for (const p of existingRows) {
    const key = nameKey(p.name);
    const readyMade = p.category?.isReadyMade === true;
    existingByName.set(key, [...(existingByName.get(key) ?? []), { id: p.id, name: p.name, recipeCount: p._count.recipeItems, readyMade }]);
  }
  const ambiguous = (key: string) => (existingByName.get(key)?.length ?? 0) > 1;

  // ---- Products table
  const productRows = canonicalRows(rows, IMPORT_HEADERS);
  const results: BulkImportRowResult[] = [];
  const validProducts = new Map<string, ProductRow>();
  const productErrorRow = new Map<string, number>(); // dish key → its row, when that row has an error

  productRows.forEach((r, i) => {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row
    const checked = checkProductRow(r, categoryByName);
    if ("error" in checked) {
      results.push({ row: rowNum, status: "error", name: checked.name, message: checked.error });
      if (checked.name) productErrorRow.set(nameKey(checked.name), rowNum);
      return;
    }
    const key = nameKey(checked.name);
    const earlier = validProducts.get(key) ?? (productErrorRow.has(key) ? { row: productErrorRow.get(key)! } : undefined);
    if (earlier) {
      results.push({ row: rowNum, status: "error", name: checked.name, message: `Row ${earlier.row} already lists "${checked.name}". List each dish once.` });
      return;
    }
    if (ambiguous(key)) {
      results.push({ row: rowNum, status: "error", name: checked.name, message: `More than one product is named "${checked.name}". Rename one first, so the import knows which to update.` });
      productErrorRow.set(key, rowNum);
      return;
    }
    const existing = existingByName.get(key)?.[0];
    validProducts.set(key, { ...checked, row: rowNum, key, existingId: existing?.id });
    results.push({ row: rowNum, status: existing ? "updated" : "created", name: checked.name });
  });

  // ---- Recipes table
  const lines = canonicalRows(recipeRows, RECIPE_HEADERS);
  const recipeResults: BulkImportRecipeRowResult[] = [];
  const linesByDish = new Map<string, RecipeLine[]>();
  const brokenDishes = new Set<string>(); // dishes with at least one bad recipe row
  const materialsSeen = new Map<string, Map<string, number>>(); // dish → material id → row

  lines.forEach((r, i) => {
    const rowNum = i + 2;
    const productName = r.product?.trim() ?? "";
    const materialName = r.rawMaterial?.trim() ?? "";
    const fail = (message: string) => {
      recipeResults.push({ row: rowNum, status: "error", product: productName || undefined, rawMaterial: materialName || undefined, message });
      if (productName) brokenDishes.add(nameKey(productName));
    };

    if (!productName) return fail("Missing product name");
    const dishKey = nameKey(productName);
    if (productErrorRow.has(dishKey)) return fail(`Its dish (row ${productErrorRow.get(dishKey)} of Products) has an error`);
    if (!validProducts.has(dishKey)) {
      if (ambiguous(dishKey)) return fail(`More than one product is named "${productName}". Rename one first.`);
      if (!existingByName.has(dishKey)) return fail(`No dish named "${productName}" in Products or on the menu`);
    }
    // The Products row decides the category when there is one, otherwise the menu does.
    const readyMade = validProducts.get(dishKey)?.readyMade ?? existingByName.get(dishKey)![0].readyMade;
    if (readyMade) return fail(READY_MADE_NO_RECIPE);

    if (!materialName) return fail("Missing raw material");
    const material = materialByName.get(nameKey(materialName));
    if (!material) return fail(`Unknown raw material "${materialName}". Add it on the Raw materials page first.`);

    const qty = parseNumber(r.qtyPerServing);
    if (qty === undefined || Number.isNaN(qty) || qty <= 0 || qty > 100_000) {
      return fail("Amount per serving must be a number above 0 (in the raw material's unit: g, ml or pc)");
    }

    const seen = materialsSeen.get(dishKey) ?? new Map<string, number>();
    if (seen.has(material.id)) return fail(`Row ${seen.get(material.id)} already lists ${material.name} for this dish`);
    seen.set(material.id, rowNum);
    materialsSeen.set(dishKey, seen);

    const dishName = validProducts.get(dishKey)?.name ?? existingByName.get(dishKey)![0].name;
    const line: RecipeLine = { row: rowNum, productKey: dishKey, productName: dishName, rawMaterialId: material.id, qty };
    linesByDish.set(dishKey, [...(linesByDish.get(dishKey) ?? []), line]);
    recipeResults.push({
      row: rowNum,
      status: "ok",
      product: dishName,
      rawMaterial: material.name,
      ...(material.isActive ? {} : { warning: `${material.name} is marked "not in use"; importing puts it back in use` }),
    });
  });

  // A dish whose recipe has a bad row isn't saved at all, rather than with half a recipe.
  for (const key of brokenDishes) {
    const product = validProducts.get(key);
    if (!product) continue;
    const result = results.find((r) => r.row === product.row)!;
    Object.assign(result, { status: "error", message: "Fix this dish's rows in Recipes first" });
    validProducts.delete(key);
  }

  // Every dish needs a recipe: a new one must bring it, and an existing one without a
  // recipe yet (counted in pieces before) must get one now. Ready-made items need none.
  for (const product of validProducts.values()) {
    if (product.readyMade || linesByDish.has(product.key)) continue;
    const existing = product.existingId ? existingByName.get(product.key)![0] : undefined;
    if (existing && existing.recipeCount > 0 && !existing.readyMade) continue;
    const result = results.find((r) => r.row === product.row)!;
    Object.assign(result, {
      status: "error",
      message: existing ? "This dish has no recipe yet: add its raw materials in Recipes" : "A new dish needs its recipe: add its raw materials in Recipes",
    });
    validProducts.delete(product.key);
  }

  const recipeDishes = new Set([...linesByDish.keys()].filter((k) => !brokenDishes.has(k)));

  if (!dryRun) {
    const recipeFor = (key: string): RecipeInput[] | undefined =>
      recipeDishes.has(key) ? linesByDish.get(key)!.map((l) => ({ rawMaterialId: l.rawMaterialId, qtyPerServing: l.qty })) : undefined;

    for (const product of validProducts.values()) {
      const result = results.find((r) => r.row === product.row)!;
      const fields = { name: product.name, price: product.price, cost: product.cost, categoryId: product.categoryId, description: product.description };
      try {
        if (product.existingId) await updateProduct(product.existingId, { ...fields, recipe: recipeFor(product.key) });
        else await createProduct({ ...fields, recipe: recipeFor(product.key) });
      } catch (err) {
        Object.assign(result, { status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    }
    // Recipe rows for dishes already on the menu that aren't in the Products table.
    for (const key of recipeDishes) {
      if (validProducts.has(key) || productRows.some((r) => r.name && nameKey(r.name) === key)) continue;
      const existing = existingByName.get(key)![0];
      try {
        await updateProduct(existing.id, { recipe: recipeFor(key) });
      } catch (err) {
        for (const l of linesByDish.get(key)!) {
          const line = recipeResults.find((r) => r.row === l.row)!;
          Object.assign(line, { status: "error", message: err instanceof Error ? err.message : "Unknown error" });
        }
      }
    }
  }

  const productErrors = results.filter((r) => r.status === "error").length;
  const recipeErrors = recipeResults.filter((r) => r.status === "error").length;
  return {
    total: productRows.length,
    created: results.filter((r) => r.status === "created").length,
    updated: results.filter((r) => r.status === "updated").length,
    errors: productErrors + recipeErrors,
    warnings: recipeResults.filter((r) => r.warning).length,
    dryRun,
    results,
    recipes: { total: lines.length, dishes: recipeDishes.size, errors: recipeErrors, results: recipeResults },
  };
}
