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
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN; // NaN signals "present but invalid" vs undefined "absent"
}

/**
 * Matches the manuscript's bulk CSV/Excel import requirement. Rows are matched to
 * existing products by barcode (update) or created new if the barcode is absent/
 * unmatched — there's no spreadsheet-column-mapping UI like a full ETL tool would
 * have; this expects the fixed header set in IMPORT_HEADERS, which the downloadable
 * template (GET /api/products/import-template) provides.
 */
export async function bulkImportProducts(rows: Record<string, string>[]): Promise<BulkImportSummary> {
  const categories = await prisma.category.findMany();
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  const results: BulkImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row
    const r = rows[i];
    const name = r.name?.trim();

    if (!name) {
      results.push({ row: rowNum, status: "error", message: "Missing product name" });
      errors++;
      continue;
    }

    const category = r.category ? categoryByName.get(r.category.trim().toLowerCase()) : undefined;
    if (!category) {
      results.push({ row: rowNum, status: "error", name, message: `Unknown category "${r.category ?? ""}"` });
      errors++;
      continue;
    }

    const price = parseNumber(r.price);
    if (price === undefined || Number.isNaN(price) || price < 0) {
      results.push({ row: rowNum, status: "error", name, message: "Price is required and must be a number" });
      errors++;
      continue;
    }

    const cost = parseNumber(r.cost);
    if (cost !== undefined && Number.isNaN(cost)) {
      results.push({ row: rowNum, status: "error", name, message: "Cost must be a number if provided" });
      errors++;
      continue;
    }

    const stockQty = parseNumber(r.stockQty);
    const minStockThreshold = parseNumber(r.minStockThreshold);
    if ((stockQty !== undefined && Number.isNaN(stockQty)) || (minStockThreshold !== undefined && Number.isNaN(minStockThreshold))) {
      results.push({ row: rowNum, status: "error", name, message: "Stock quantities must be numbers if provided" });
      errors++;
      continue;
    }

    const barcode = r.barcode?.trim() || undefined;
    const existing = barcode ? await prisma.product.findUnique({ where: { barcode } }) : null;

    try {
      if (existing) {
        await updateProduct(existing.id, {
          name,
          price,
          cost,
          categoryId: category.id,
          description: r.description || undefined,
          stockQty,
          minStockThreshold,
        });
        results.push({ row: rowNum, status: "updated", name });
        updated++;
      } else {
        await createProduct({
          name,
          price,
          cost,
          barcode,
          categoryId: category.id,
          description: r.description || undefined,
          stockQty: stockQty ?? 0,
          minStockThreshold: minStockThreshold ?? 5,
        });
        results.push({ row: rowNum, status: "created", name });
        created++;
      }
    } catch (err) {
      results.push({ row: rowNum, status: "error", name, message: err instanceof Error ? err.message : "Unknown error" });
      errors++;
    }
  }

  return { total: rows.length, created, updated, errors, results };
}
