import ExcelJS from "exceljs";
import type { Category } from "@prisma/client";
import { HttpError } from "../../middleware/errorHandler";
import { toCSV } from "../../lib/csv";
import { IMPORT_HEADERS } from "./bulkImport";

/**
 * Excel (.xlsx) support for the bulk product import (the manuscript's "CSV or Excel
 * file uploads"). An uploaded workbook is turned into the same CSV text the import page
 * already previews and imports, so both kinds of file go through exactly the same
 * checks, and the admin can still fix a row in the text box before importing.
 */

/** Largest workbook accepted, before base64. A product list is far smaller than this. */
export const MAX_XLSX_BYTES = 2 * 1024 * 1024;
/** Rows read from one sheet, so an oversized sheet can't tie the server up. */
export const MAX_XLSX_ROWS = 5000;

type Header = (typeof IMPORT_HEADERS)[number];

// "Stock qty", "stock_qty" and "StockQty" all mean stockQty.
const normalise = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
const HEADER_BY_KEY = new Map<string, Header>(IMPORT_HEADERS.map((h) => [normalise(h), h]));

/** A cell's value as the text a CSV would hold. */
export function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("formula" in value || "sharedFormula" in value) return cellToText((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ("hyperlink" in value) return cellToText((value as { text?: ExcelJS.CellValue }).text ?? null);
    if ("error" in value) return "";
  }
  return String(value);
}

export interface ConvertedSheet {
  sheetName: string;
  csvText: string;
  rows: number;
  /** Columns that weren't recognised and were left out, as written in the sheet. */
  ignoredColumns: string[];
}

/**
 * Reads the first worksheet of an .xlsx file and returns its product rows as CSV. The
 * header row is the first of the top ten rows that has "name" and "price" columns, so a
 * sheet with a title above the table (like this system's own Excel reports) works too.
 */
export async function xlsxToImportCsv(file: Buffer): Promise<ConvertedSheet> {
  if (file.length > MAX_XLSX_BYTES) throw new HttpError(413, "The Excel file is larger than 2 MB. Split it into smaller files.");

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(400, "This file isn't an Excel workbook (.xlsx). In Excel, use Save As → Excel Workbook, or save it as CSV.");
  }
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) throw new HttpError(400, "The Excel file has no rows.");
  if (sheet.actualRowCount > MAX_XLSX_ROWS + 10) {
    throw new HttpError(400, `The sheet "${sheet.name}" has more than ${MAX_XLSX_ROWS} rows. Split it into smaller files.`);
  }

  // Column number → import header, from the first row that looks like the header.
  let headerRow = 0;
  let columns = new Map<number, Header>();
  let ignoredColumns: string[] = [];
  for (let r = 1; r <= Math.min(10, sheet.rowCount) && headerRow === 0; r++) {
    const found = new Map<number, Header>();
    const ignored: string[] = [];
    sheet.getRow(r).eachCell((cell, col) => {
      const text = cellToText(cell.value);
      const header = HEADER_BY_KEY.get(normalise(text));
      if (header && ![...found.values()].includes(header)) found.set(col, header);
      else if (text) ignored.push(text);
    });
    const headers = [...found.values()];
    if (headers.includes("name") && headers.includes("price")) {
      headerRow = r;
      columns = found;
      ignoredColumns = ignored;
    }
  }
  if (headerRow === 0) {
    throw new HttpError(
      400,
      `Couldn't find the header row in the sheet "${sheet.name}". Its first row should name the columns: ${IMPORT_HEADERS.join(", ")} (name, category and price are required).`
    );
  }

  // Keep the template's column order, whatever order the sheet uses.
  const ordered = IMPORT_HEADERS.filter((h) => [...columns.values()].includes(h));
  const colOf = new Map([...columns.entries()].map(([col, h]) => [h, col]));
  const rows: Record<string, string>[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values = Object.fromEntries(ordered.map((h) => [h, cellToText(row.getCell(colOf.get(h)!).value)]));
    if (Object.values(values).some((v) => v !== "")) rows.push(values);
  }
  if (rows.length === 0) throw new HttpError(400, `The sheet "${sheet.name}" has a header row but no products under it.`);

  // toCSV takes its header from the first row's keys, which are always all of `ordered`.
  return { sheetName: sheet.name, csvText: toCSV(rows), rows: rows.length, ignoredColumns };
}

/**
 * The Excel version of the import template: the header row, one sample product, the
 * barcode column stored as text (so leading zeros survive), and a category dropdown
 * listing the categories that exist right now.
 */
export async function buildImportTemplateXlsx(categories: Pick<Category, "name">[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zak's Sizzling Hub";
  const sheet = workbook.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = IMPORT_HEADERS.map((h) => ({
    header: h,
    key: h,
    width: h === "name" || h === "description" ? 28 : h === "barcode" || h === "category" ? 18 : 14,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn("barcode").numFmt = "@";
  sheet.getColumn("price").numFmt = "0.00";
  sheet.getColumn("cost").numFmt = "0.00";

  const names = categories.map((c) => c.name);
  const sampleCategory = names.find((n) => n.toLowerCase() === "drinks") ?? names[0] ?? "Drinks";
  sheet.addRow({
    name: "Sample Iced Tea",
    barcode: "",
    category: sampleCategory,
    price: 45,
    cost: 20,
    stockQty: 25,
    minStockThreshold: 5,
    description: "Optional",
  });

  if (names.length > 0) {
    const list = workbook.addWorksheet("Categories");
    list.addRow(["Categories (pick one in the category column)"]).font = { bold: true };
    for (const name of names) list.addRow([name]);
    list.getColumn(1).width = 44;
    const categoryCol = sheet.getColumn("category").letter;
    for (let r = 2; r <= 500; r++) {
      sheet.getCell(`${categoryCol}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`Categories!$A$2:$A$${names.length + 1}`],
        showErrorMessage: true,
        errorTitle: "Unknown category",
        error: "Choose one of the categories from the list.",
      };
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
