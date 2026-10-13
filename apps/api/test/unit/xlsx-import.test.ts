import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

// Reading Excel files for the bulk product import (products/xlsxImport.ts). Only the
// file handling is tested here, so the database modules the import uses are replaced.
vi.mock("../../src/lib/prisma", () => ({ prisma: {} }));
vi.mock("../../src/modules/products/service", () => ({}));

import { fromCSV } from "../../src/lib/csv";
import { HttpError } from "../../src/middleware/errorHandler";
import { buildImportTemplateXlsx, cellToText, MAX_XLSX_BYTES, xlsxToImportCsv } from "../../src/modules/products/xlsxImport";

/** A workbook with one sheet holding `rows`, as an .xlsx file. */
async function workbook(rows: ExcelJS.CellValue[][], setup?: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Products");
  for (const row of rows) sheet.addRow(row);
  setup?.(sheet);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (err: unknown) => err as HttpError
  );

describe("reading a cell", () => {
  it("turns each kind of Excel value into the text a CSV would hold", () => {
    expect(cellToText(null)).toBe("");
    expect(cellToText(45.5)).toBe("45.5");
    expect(cellToText("  Iced Tea ")).toBe("Iced Tea");
    expect(cellToText(true)).toBe("TRUE");
    expect(cellToText(new Date("2026-10-15T00:00:00Z"))).toBe("2026-10-15");
    expect(cellToText({ richText: [{ text: "Sizzling " }, { text: "Sisig" }] })).toBe("Sizzling Sisig");
    expect(cellToText({ formula: "A1*2", result: 90 } as ExcelJS.CellFormulaValue)).toBe("90");
    expect(cellToText({ text: "Menu", hyperlink: "https://example.com" })).toBe("Menu");
    expect(cellToText({ error: "#DIV/0!" } as ExcelJS.CellErrorValue)).toBe("");
  });
});

describe("turning a sheet into import CSV", () => {
  it("matches column names loosely, keeps the template's column order, and leaves out other columns", async () => {
    const file = await workbook([
      ["Price", "Product notes", "NAME", "Category", "Stock qty", "min_stock_threshold"],
      [185, "ignored", "Sizzling Sisig", "Sizzling Plates", 20, 5],
    ]);

    const result = await xlsxToImportCsv(file);

    expect(result).toMatchObject({ sheetName: "Products", rows: 1, ignoredColumns: ["Product notes"] });
    expect(result.csvText).toBe("name,category,price,stockQty,minStockThreshold\nSizzling Sisig,Sizzling Plates,185,20,5");
  });

  it("finds the header row below a title, and skips empty rows", async () => {
    const file = await workbook([
      ["Zak's Sizzling Hub — new menu items"],
      [],
      ["name", "category", "price"],
      ["Halo-Halo", "Desserts", 90],
      [],
      ["Leche Flan", "Desserts", 75],
    ]);

    expect(fromCSV((await xlsxToImportCsv(file)).csvText)).toEqual([
      { name: "Halo-Halo", category: "Desserts", price: "90" },
      { name: "Leche Flan", category: "Desserts", price: "75" },
    ]);
  });

  it("keeps a text barcode's leading zeros, uses a formula's result, and survives commas and quotes", async () => {
    const file = await workbook(
      [
        ["name", "barcode", "category", "price", "description"],
        ["Bottled Water", "0048000123", "Drinks", { formula: "10*2", result: 20 }, 'Cold, "500 ml"'],
      ],
      (sheet) => {
        sheet.getColumn(2).numFmt = "@";
      }
    );

    expect(fromCSV((await xlsxToImportCsv(file)).csvText)).toEqual([
      { name: "Bottled Water", barcode: "0048000123", category: "Drinks", price: "20", description: 'Cold, "500 ml"' },
    ]);
  });

  it("uses the first sheet that has rows", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Notes");
    const sheet = wb.addWorksheet("Menu");
    sheet.addRow(["name", "category", "price"]);
    sheet.addRow(["Plain Rice", "Rice & Noodles", 25]);

    const result = await xlsxToImportCsv(Buffer.from(await wb.xlsx.writeBuffer()));

    expect(result).toMatchObject({ sheetName: "Menu", rows: 1 });
  });

  it("explains a sheet without a header row", async () => {
    const err = await failure(xlsxToImportCsv(await workbook([["Sisig", 185], ["Bulalo", 260]])));

    expect(err).toMatchObject({ status: 400 });
    expect(err?.message).toMatch(/^Couldn't find the header row in the sheet "Products"/);
  });

  it("explains a header row with no products under it", async () => {
    const err = await failure(xlsxToImportCsv(await workbook([["name", "category", "price"]])));

    expect(err).toMatchObject({ status: 400, message: 'The sheet "Products" has a header row but no products under it.' });
  });

  it("refuses a file that isn't an .xlsx workbook, saying how to save one", async () => {
    const err = await failure(xlsxToImportCsv(Buffer.from("name,category,price\nSisig,Sizzling Plates,185")));

    expect(err).toMatchObject({ status: 400 });
    expect(err?.message).toMatch(/isn't an Excel workbook \(\.xlsx\).*Save As/);
  });

  it("refuses a file over 2 MB before reading it", async () => {
    const err = await failure(xlsxToImportCsv(Buffer.alloc(MAX_XLSX_BYTES + 1)));

    expect(err).toMatchObject({ status: 413 });
  });
});

describe("the Excel template", () => {
  const categories = [{ name: "Sizzling Plates" }, { name: "Drinks" }, { name: "Desserts" }];

  it("has the import columns, a sample row in Drinks, and the barcode column stored as text", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildImportTemplateXlsx(categories)) as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Products")!;

    expect(sheet.getRow(1).values).toEqual([
      undefined,
      "name",
      "barcode",
      "category",
      "price",
      "cost",
      "stockQty",
      "minStockThreshold",
      "description",
    ]);
    expect(sheet.getCell("A2").value).toBe("Sample Iced Tea");
    expect(sheet.getCell("C2").value).toBe("Drinks");
    expect(sheet.getColumn(2).numFmt).toBe("@");
  });

  it("offers the current categories as a dropdown in the category column", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildImportTemplateXlsx(categories)) as unknown as ArrayBuffer);

    expect(wb.getWorksheet("Categories")!.getColumn(1).values.slice(2)).toEqual(["Sizzling Plates", "Drinks", "Desserts"]);
    expect(wb.getWorksheet("Products")!.getCell("C10").dataValidation).toMatchObject({
      type: "list",
      formulae: ["Categories!$A$2:$A$4"],
    });
  });

  it("uses the first category for the sample when there is no Drinks category", async () => {
    const result = await xlsxToImportCsv(await buildImportTemplateXlsx([{ name: "Sizzling Plates" }]));

    expect(fromCSV(result.csvText)[0]).toMatchObject({ name: "Sample Iced Tea", category: "Sizzling Plates", price: "45" });
  });
});
