import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

// Reading Excel files for the bulk product import (products/xlsxImport.ts). Only the
// file handling is tested here, so the database modules the import uses are replaced.
vi.mock("../../src/lib/prisma", () => ({ prisma: {} }));
vi.mock("../../src/modules/products/service", () => ({}));

import { fromCSV } from "../../src/lib/csv";
import { HttpError } from "../../src/middleware/errorHandler";
import {
  buildImportTemplateXlsx,
  cellToText,
  MAX_XLSX_BYTES,
  MAX_XLSX_ENTRIES,
  xlsxToImportCsv,
} from "../../src/modules/products/xlsxImport";

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

describe("files that would cost too much to read", () => {
  // A zip whose one entry unpacks to 30 MB of zeros, from about 30 KB.
  async function zipBomb(): Promise<Buffer> {
    const zip = new JSZip();
    zip.file("xl/worksheets/sheet1.xml", Buffer.alloc(30 * 1024 * 1024));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }

  it("refuses a small file that unpacks to more than 20 MB, without unpacking it all", async () => {
    const bomb = await zipBomb();

    const err = await failure(xlsxToImportCsv(bomb));

    expect(bomb.length).toBeLessThan(100_000);
    expect(err).toMatchObject({ status: 413, message: expect.stringMatching(/too large once unpacked/) });
  });

  it("refuses it even when the zip claims its contents are tiny", async () => {
    const bomb = await zipBomb();
    // Overwrite the declared unpacked size in the local header and the central directory.
    for (let i = 0; i < bomb.length - 4; i++) {
      const sig = bomb.readUInt32LE(i);
      if (sig === 0x04034b50) bomb.writeUInt32LE(100, i + 22);
      if (sig === 0x02014b50) bomb.writeUInt32LE(100, i + 24);
    }

    const err = await failure(xlsxToImportCsv(bomb));

    expect(err).toMatchObject({ status: 413 });
  });

  it("refuses a zip with hundreds of files in it", async () => {
    const zip = new JSZip();
    for (let i = 0; i < MAX_XLSX_ENTRIES + 1; i++) zip.file(`part${i}.xml`, "<x/>");

    const err = await failure(xlsxToImportCsv(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })));

    expect(err).toMatchObject({ status: 413 });
  });

  it("reads only the rows that hold something, even with a stray cell a million rows down", async () => {
    const file = await workbook([["name", "category", "price"], ["Sizzling Sisig", "Sizzling Plates", 185]], (sheet) => {
      sheet.getCell("A1000000").value = "Far Away Tea";
    });

    const started = Date.now();
    const result = await xlsxToImportCsv(file);

    expect(Date.now() - started).toBeLessThan(2000);
    expect(fromCSV(result.csvText).map((r) => r.name)).toEqual(["Sizzling Sisig", "Far Away Tea"]);
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
