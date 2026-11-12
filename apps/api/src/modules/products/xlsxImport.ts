import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import type { Category, RawMaterial } from "@prisma/client";
import { HttpError } from "../../middleware/errorHandler";
import { toCSV } from "../../lib/csv";
import { IMPORT_HEADERS, RECIPE_HEADERS, normaliseHeader } from "./bulkImport";

/**
 * Excel (.xlsx) support for the bulk product import (the manuscript's "CSV or Excel
 * file uploads"). An uploaded workbook's Products and Recipes sheets are turned into the
 * same CSV texts the import page already previews and imports, so both kinds of file go
 * through exactly the same checks, and the admin can still fix a row before importing.
 */

/** Largest workbook accepted, before base64. A product list is far smaller than this. */
export const MAX_XLSX_BYTES = 2 * 1024 * 1024;
/** Rows read from one sheet, so an oversized sheet can't tie the server up. */
export const MAX_XLSX_ROWS = 5000;
/**
 * An .xlsx is a zip, so a small upload can unpack into gigabytes (a "zip bomb"). These
 * bound what exceljs is ever asked to unpack: a 5000-row product sheet is a few MB.
 */
export const MAX_XLSX_UNPACKED_BYTES = 20 * 1024 * 1024;
export const MAX_XLSX_ENTRIES = 200;

const NOT_XLSX = "This file isn't an Excel workbook (.xlsx). In Excel, use Save As → Excel Workbook, or save it as CSV.";
const TOO_BIG_UNPACKED = "The Excel file is too large once unpacked. Split it into smaller files, or save it as CSV.";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = Buffer.from([0x50, 0x4b, 0x05, 0x06]); // 0x06054b50, little-endian
const SIG_ZIP64_LOCATOR = 0x07064b50;

/**
 * Unpacks every entry of the zip with a hard output limit, before exceljs sees the file.
 * The sizes a zip declares can lie, so each entry is actually inflated (zlib's
 * maxOutputLength stops it at the budget) rather than trusted.
 *
 * This only protects exceljs if it reads exactly the entries checked here, so the zip is
 * walked the way JSZip (inside exceljs) walks it, and anything the two could read
 * differently is refused: JSZip takes the last end-of-directory record in the file,
 * reads directory records for as long as their signature continues (whatever count the
 * end record gives), shifts every offset when there are extra bytes before the
 * directory, and follows Zip64 fields. No product sheet needs Zip64 or extra bytes.
 */
export function assertXlsxUnpacksSafely(file: Buffer): void {
  const eocd = file.lastIndexOf(SIG_END);
  if (eocd < 0 || eocd + 22 > file.length) throw new HttpError(400, NOT_XLSX);

  const entries = file.readUInt16LE(eocd + 10);
  const directorySize = file.readUInt32LE(eocd + 12);
  const directoryStart = file.readUInt32LE(eocd + 16);
  const zip64 =
    [file.readUInt16LE(eocd + 4), file.readUInt16LE(eocd + 6), file.readUInt16LE(eocd + 8), entries].includes(0xffff) ||
    directorySize === 0xffffffff ||
    directoryStart === 0xffffffff ||
    (eocd >= 20 && file.readUInt32LE(eocd - 20) === SIG_ZIP64_LOCATOR);
  if (zip64) throw new HttpError(413, TOO_BIG_UNPACKED);
  if (entries > MAX_XLSX_ENTRIES) throw new HttpError(413, TOO_BIG_UNPACKED);
  // Where JSZip would find "extra bytes" and shift every offset by them.
  if (directoryStart + directorySize !== eocd) throw new HttpError(400, NOT_XLSX);

  let p = directoryStart;
  let found = 0;
  let budget = MAX_XLSX_UNPACKED_BYTES;

  while (p + 4 <= file.length && file.readUInt32LE(p) === SIG_CENTRAL) {
    if (++found > MAX_XLSX_ENTRIES) throw new HttpError(413, TOO_BIG_UNPACKED);
    if (p + 46 > file.length) throw new HttpError(400, NOT_XLSX);
    const method = file.readUInt16LE(p + 10);
    const compressedSize = file.readUInt32LE(p + 20);
    const uncompressedSize = file.readUInt32LE(p + 24);
    const localHeader = file.readUInt32LE(p + 42);
    // 0xFFFFFFFF sends JSZip to the entry's Zip64 extra field for the real value.
    if ([compressedSize, uncompressedSize, localHeader].includes(0xffffffff)) throw new HttpError(413, TOO_BIG_UNPACKED);
    p += 46 + file.readUInt16LE(p + 28) + file.readUInt16LE(p + 30) + file.readUInt16LE(p + 32);

    if (localHeader + 30 > file.length || file.readUInt32LE(localHeader) !== SIG_LOCAL) throw new HttpError(400, NOT_XLSX);
    const start = localHeader + 30 + file.readUInt16LE(localHeader + 26) + file.readUInt16LE(localHeader + 28);
    if (start + compressedSize > file.length) throw new HttpError(400, NOT_XLSX);
    const data = file.subarray(start, start + compressedSize);

    let unpacked: number;
    if (method === 0) unpacked = data.length;
    else if (method === 8) {
      try {
        unpacked = inflateRawSync(data, { maxOutputLength: budget + 1 }).length;
      } catch (err) {
        if (err instanceof RangeError) throw new HttpError(413, TOO_BIG_UNPACKED);
        throw new HttpError(400, NOT_XLSX);
      }
    } else throw new HttpError(400, NOT_XLSX);

    budget -= unpacked;
    if (budget < 0) throw new HttpError(413, TOO_BIG_UNPACKED);
  }

  // The records must end exactly at the end record and match its count, so the entries
  // checked above are all the entries there are.
  if (found === 0 || found !== entries || p !== eocd) throw new HttpError(400, NOT_XLSX);
}

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

export interface ConvertedTable {
  sheetName: string;
  csvText: string;
  rows: number;
  /** Columns that weren't recognised and were left out, as written in the sheet. */
  ignoredColumns: string[];
}

export interface ConvertedWorkbook extends ConvertedTable {
  /** The Recipes sheet (product, rawMaterial, qtyPerServing), when the workbook has one. */
  recipes: ConvertedTable | null;
}

interface Table<H extends string> {
  headers: readonly H[];
  /** Columns that make a row the header row (the others are optional). */
  required: readonly H[];
}
const PRODUCTS_TABLE: Table<(typeof IMPORT_HEADERS)[number]> = { headers: IMPORT_HEADERS, required: ["name", "price"] };
const RECIPES_TABLE: Table<(typeof RECIPE_HEADERS)[number]> = { headers: RECIPE_HEADERS, required: ["product", "rawMaterial", "qtyPerServing"] };

/**
 * Finds a table in a sheet: its header row is the first of the top ten rows that names
 * the table's required columns, so a title above the table (like this system's own
 * Excel reports) works too. Returns null when the sheet doesn't hold this table.
 */
function readTable<H extends string>(sheet: ExcelJS.Worksheet, table: Table<H>): ConvertedTable | null {
  const byKey = new Map(table.headers.map((h) => [normaliseHeader(h), h]));
  let headerRow = 0;
  let columns = new Map<number, H>();
  let ignoredColumns: string[] = [];
  for (let r = 1; r <= Math.min(10, sheet.rowCount) && headerRow === 0; r++) {
    const found = new Map<number, H>();
    const ignored: string[] = [];
    sheet.getRow(r).eachCell((cell, col) => {
      const text = cellToText(cell.value);
      const header = byKey.get(normaliseHeader(text));
      if (header && ![...found.values()].includes(header)) found.set(col, header);
      else if (text) ignored.push(text);
    });
    const headers = [...found.values()];
    if (table.required.every((h) => headers.includes(h))) {
      headerRow = r;
      columns = found;
      ignoredColumns = ignored;
    }
  }
  if (headerRow === 0) return null;
  if (sheet.actualRowCount > MAX_XLSX_ROWS + 10) {
    throw new HttpError(400, `The sheet "${sheet.name}" has more than ${MAX_XLSX_ROWS} rows. Split it into smaller files.`);
  }

  // Keep the template's column order, whatever order the sheet uses.
  const ordered = table.headers.filter((h) => [...columns.values()].includes(h));
  const colOf = new Map([...columns.entries()].map(([col, h]) => [h, col]));
  const rows: Record<string, string>[] = [];
  // eachRow visits only rows that hold values. Counting up to sheet.rowCount instead
  // would walk a million empty rows for one stray cell at the bottom of the sheet.
  sheet.eachRow((row, r) => {
    if (r <= headerRow) return;
    const values = Object.fromEntries(ordered.map((h) => [h, cellToText(row.getCell(colOf.get(h)!).value)]));
    if (Object.values(values).some((v) => v !== "")) rows.push(values);
  });
  // toCSV takes its header from the first row's keys, which are always all of `ordered`.
  return { sheetName: sheet.name, csvText: rows.length ? toCSV(rows) : "", rows: rows.length, ignoredColumns };
}

/**
 * Reads an .xlsx file's Products table (name, category, price, cost, description) and, if
 * there is one, its Recipes table (product, rawMaterial, qtyPerServing), each from the
 * first sheet that holds it, and returns them as CSV.
 */
export async function xlsxToImportCsv(file: Buffer): Promise<ConvertedWorkbook> {
  if (file.length > MAX_XLSX_BYTES) throw new HttpError(413, "The Excel file is larger than 2 MB. Split it into smaller files.");

  assertXlsxUnpacksSafely(file);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(400, NOT_XLSX);
  }
  const sheets = workbook.worksheets.filter((ws) => ws.actualRowCount > 0);
  if (sheets.length === 0) throw new HttpError(400, "The Excel file has no rows.");

  let products: ConvertedTable | null = null;
  let recipes: ConvertedTable | null = null;
  for (const sheet of sheets) {
    if (!recipes) {
      recipes = readTable(sheet, RECIPES_TABLE);
      if (recipes) continue;
    }
    if (!products) products = readTable(sheet, PRODUCTS_TABLE);
  }

  if (!products && !recipes) {
    throw new HttpError(
      400,
      `Couldn't find a Products or Recipes table. A Products sheet's first row names the columns ${IMPORT_HEADERS.join(", ")} (name, category and price are required); a Recipes sheet's names ${RECIPE_HEADERS.join(", ")}.`
    );
  }
  if ((products?.rows ?? 0) + (recipes?.rows ?? 0) === 0) throw new HttpError(400, "The Excel file has header rows but no rows under them.");

  const empty: ConvertedTable = { sheetName: "", csvText: "", rows: 0, ignoredColumns: [] };
  return { ...(products ?? empty), recipes: recipes && recipes.rows > 0 ? recipes : null };
}

/** A dropdown on a column, listing the values in another sheet's first column. */
function listValidation(sheet: ExcelJS.Worksheet, column: string, listSheet: string, count: number, title: string, error: string) {
  for (let r = 2; r <= 500; r++) {
    sheet.getCell(`${column}${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`'${listSheet}'!$A$2:$A$${count + 1}`],
      showErrorMessage: true,
      errorTitle: title,
      error,
    };
  }
}

/**
 * The Excel import template: a Products sheet (one sample dish), a Recipes sheet (that
 * dish's bill of materials) and reference lists of the categories and raw materials that
 * exist right now, which the category and raw-material columns offer as dropdowns.
 */
export async function buildImportTemplateXlsx(
  categories: Pick<Category, "name">[],
  materials: Pick<RawMaterial, "name" | "unit">[] = []
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zak's Sizzling Hub";

  const products = workbook.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
  products.columns = IMPORT_HEADERS.map((h) => ({ header: h, key: h, width: h === "name" || h === "description" ? 30 : h === "category" ? 18 : 12 }));
  products.getRow(1).font = { bold: true };
  products.getColumn("price").numFmt = "0.00";
  products.getColumn("cost").numFmt = "0.00";

  const recipes = workbook.addWorksheet("Recipes", { views: [{ state: "frozen", ySplit: 1 }] });
  recipes.columns = RECIPE_HEADERS.map((h) => ({ header: h, key: h, width: h === "qtyPerServing" ? 16 : 30 }));
  recipes.getRow(1).font = { bold: true };

  const names = categories.map((c) => c.name);
  const sampleCategory = names.find((n) => n.toLowerCase() === "drinks") ?? names[0] ?? "Drinks";
  products.addRow({ name: "Sample Iced Tea", category: sampleCategory, price: 45, cost: 12, description: "Optional" });

  // The sample recipe uses real raw materials when there are any, so it imports as is.
  const sample = materials.slice(0, 2);
  if (sample.length > 0) {
    for (const m of sample) recipes.addRow({ product: "Sample Iced Tea", rawMaterial: m.name, qtyPerServing: m.unit === "pc" ? 1 : 100 });
  } else {
    recipes.addRow({ product: "Sample Iced Tea", rawMaterial: "Iced tea mix", qtyPerServing: 20 });
  }

  if (names.length > 0) {
    const list = workbook.addWorksheet("Categories");
    list.addRow(["Categories (pick one in the category column)"]).font = { bold: true };
    for (const name of names) list.addRow([name]);
    list.getColumn(1).width = 44;
    listValidation(products, products.getColumn("category").letter, "Categories", names.length, "Unknown category", "Choose one of the categories from the list.");
  }

  if (materials.length > 0) {
    const list = workbook.addWorksheet("Raw materials");
    list.addRow(["Raw materials (pick one in Recipes)", "Unit of qtyPerServing"]).font = { bold: true };
    for (const m of materials) list.addRow([m.name, m.unit]);
    list.getColumn(1).width = 40;
    list.getColumn(2).width = 22;
    listValidation(recipes, recipes.getColumn("rawMaterial").letter, "Raw materials", materials.length, "Unknown raw material", "Choose one of the raw materials from the list.");
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
