import type { Category } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { createProduct, updateProduct } from "./service";
import type { BulkImportRowResult, BulkImportSummary } from "@zaks/shared-types";

export const IMPORT_HEADERS = [
  "name",
  "barcode",
  "category",
  "price",
  "cost",
  "stockQty",
  "minStockThreshold",
  "description",
] as const;

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN; // NaN signals "present but invalid" vs undefined "absent"
}

const isCount = (n: number | undefined) => n === undefined || (Number.isInteger(n) && n >= 0);

interface ValidRow {
  name: string;
  barcode?: string;
  categoryId: number;
  price: number;
  cost?: number;
  stockQty?: number;
  minStockThreshold?: number;
  description?: string;
}

/**
 * Checks one CSV row against the same limits as the product form (createProductSchema
 * and the database columns). Returns the parsed values, or the reason the row can't be
 * imported. Shared by the preview (dry run) and the real import, so they always agree.
 */
function checkRow(r: Record<string, string>, categoryByName: Map<string, Category>): ValidRow | { error: string; name?: string } {
  const name = r.name?.trim();
  if (!name) return { error: "Missing product name" };
  if (name.length > 150) return { error: "Product name is longer than 150 characters", name };

  const category = r.category ? categoryByName.get(r.category.trim().toLowerCase()) : undefined;
  if (!category) return { error: `Unknown category "${r.category ?? ""}"`, name };

  const price = parseNumber(r.price);
  if (price === undefined || Number.isNaN(price) || price < 0) return { error: "Price is required and must be a number", name };

  const cost = parseNumber(r.cost);
  if (cost !== undefined && (Number.isNaN(cost) || cost < 0)) return { error: "Cost must be a number of 0 or more if provided", name };

  const stockQty = parseNumber(r.stockQty);
  const minStockThreshold = parseNumber(r.minStockThreshold);
  if ((stockQty !== undefined && Number.isNaN(stockQty)) || (minStockThreshold !== undefined && Number.isNaN(minStockThreshold))) {
    return { error: "Stock quantities must be numbers if provided", name };
  }
  if (!isCount(stockQty) || !isCount(minStockThreshold)) {
    return { error: "Stock quantities must be whole numbers of 0 or more", name };
  }

  const barcode = r.barcode?.trim() || undefined;
  if (barcode && barcode.length > 64) return { error: "Barcode is longer than 64 characters", name };

  return { name, barcode, categoryId: category.id, price, cost, stockQty, minStockThreshold, description: r.description || undefined };
}

/**
 * Matches the manuscript's bulk CSV/Excel import requirement. Rows are matched to
 * existing products by barcode (update) or created new if the barcode is absent/
 * unmatched — there's no spreadsheet-column-mapping UI like a full ETL tool would
 * have; this expects the fixed header set in IMPORT_HEADERS, which the downloadable
 * template (GET /api/products/import-template) provides.
 *
 * With `dryRun`, nothing is saved: each row is checked and reported as it would be
 * imported ("created", "updated" or "error"), so the admin can fix the file first
 * (UI review #21).
 */
export async function bulkImportProducts(rows: Record<string, string>[], { dryRun = false } = {}): Promise<BulkImportSummary> {
  const categories = await prisma.category.findMany();
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  // A barcode seen on an earlier row of this file creates that product, so a later row
  // with the same barcode updates it: the preview has to follow that too.
  const barcodesInFile = new Set<string>();

  const results: BulkImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row
    const row = checkRow(rows[i], categoryByName);
    if ("error" in row) {
      results.push({ row: rowNum, status: "error", name: row.name, message: row.error });
      errors++;
      continue;
    }

    const existing = row.barcode ? await prisma.product.findUnique({ where: { barcode: row.barcode } }) : null;
    const isUpdate = Boolean(existing) || (row.barcode !== undefined && barcodesInFile.has(row.barcode));
    if (row.barcode) barcodesInFile.add(row.barcode);

    if (dryRun) {
      results.push({ row: rowNum, status: isUpdate ? "updated" : "created", name: row.name });
      if (isUpdate) updated++;
      else created++;
      continue;
    }

    try {
      if (existing) {
        await updateProduct(existing.id, {
          name: row.name,
          price: row.price,
          cost: row.cost,
          categoryId: row.categoryId,
          description: row.description,
          stockQty: row.stockQty,
          minStockThreshold: row.minStockThreshold,
        });
        results.push({ row: rowNum, status: "updated", name: row.name });
        updated++;
      } else {
        await createProduct({
          name: row.name,
          price: row.price,
          cost: row.cost,
          barcode: row.barcode,
          categoryId: row.categoryId,
          description: row.description,
          stockQty: row.stockQty ?? 0,
          minStockThreshold: row.minStockThreshold ?? 5,
        });
        results.push({ row: rowNum, status: "created", name: row.name });
        created++;
      }
    } catch (err) {
      results.push({ row: rowNum, status: "error", name: row.name, message: err instanceof Error ? err.message : "Unknown error" });
      errors++;
    }
  }

  return { total: rows.length, created, updated, errors, dryRun, results };
}
