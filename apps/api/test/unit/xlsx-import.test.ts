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
  assertXlsxUnpacksSafely,
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
      ["Price", "Product notes", "NAME", "Category", "Stock qty", "Barcode"],
      [185, "ignored", "Sizzling Sisig", "Sizzling Plates", 20, "480001"],
    ]);

    const result = await xlsxToImportCsv(file);

    // A dish's stock comes from its recipe and barcodes are gone, so those columns are left out.
    expect(result).toMatchObject({ sheetName: "Products", rows: 1, ignoredColumns: ["Product notes", "Stock qty", "Barcode"], recipes: null });
    expect(result.csvText).toBe("name,category,price\nSizzling Sisig,Sizzling Plates,185");
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

  it("uses a formula's result and survives commas and quotes", async () => {
    const file = await workbook([
      ["name", "category", "price", "cost", "description"],
      ["Bottled Water", "Drinks", { formula: "10*2", result: 20 }, 8, 'Cold, "500 ml"'],
    ]);

    expect(fromCSV((await xlsxToImportCsv(file)).csvText)).toEqual([
      { name: "Bottled Water", category: "Drinks", price: "20", cost: "8", description: 'Cold, "500 ml"' },
    ]);
  });

  it("reads the Recipes sheet next to the Products sheet, whatever the sheet order", async () => {
    const wb = new ExcelJS.Workbook();
    const recipes = wb.addWorksheet("Bill of materials");
    recipes.addRow(["Product", "Raw material", "Qty per serving"]);
    recipes.addRow(["Pork Sisig", "Pork mask", 150]);
    recipes.addRow(["Pork Sisig", "Onion", 20]);
    const products = wb.addWorksheet("Menu");
    products.addRow(["name", "category", "price"]);
    products.addRow(["Pork Sisig", "Sizzling Plates", 185]);

    const result = await xlsxToImportCsv(Buffer.from(await wb.xlsx.writeBuffer()));

    expect(result).toMatchObject({ sheetName: "Menu", rows: 1 });
    expect(result.recipes).toMatchObject({ sheetName: "Bill of materials", rows: 2, ignoredColumns: [] });
    expect(fromCSV(result.recipes!.csvText)).toEqual([
      { product: "Pork Sisig", rawMaterial: "Pork mask", qtyPerServing: "150" },
      { product: "Pork Sisig", rawMaterial: "Onion", qtyPerServing: "20" },
    ]);
  });

  it("accepts a workbook with only recipes, to update the recipes of dishes already on the menu", async () => {
    const file = await workbook([
      ["product", "rawMaterial", "qtyPerServing"],
      ["Java Rice", "Rice", 180],
    ]);

    const result = await xlsxToImportCsv(file);

    expect(result).toMatchObject({ csvText: "", rows: 0, recipes: { rows: 1 } });
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
    expect(err?.message).toMatch(/^Couldn't find a Products or Recipes table/);
  });

  it("explains a header row with no products under it", async () => {
    const err = await failure(xlsxToImportCsv(await workbook([["name", "category", "price"]])));

    expect(err).toMatchObject({ status: 400, message: "The Excel file has header rows but no rows under them." });
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

  // The check only helps if it sees every entry JSZip (inside exceljs) will unpack. Each
  // file below is one JSZip still opens, with more in it than a naive check would see.
  describe("zips that JSZip would read differently from a naive check", () => {
    async function smallThenBomb(): Promise<Buffer> {
      const zip = new JSZip();
      zip.file("a.xml", "<a/>");
      zip.file("b.xml", Buffer.alloc(30 * 1024 * 1024));
      return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    }
    const endRecord = (zip: Buffer) => zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

    it("refuses an end record that counts fewer entries than the directory holds", async () => {
      const zip = await smallThenBomb();
      zip.writeUInt16LE(1, endRecord(zip) + 8);
      zip.writeUInt16LE(1, endRecord(zip) + 10);

      expect(Object.keys((await JSZip.loadAsync(zip)).files)).toEqual(["a.xml", "b.xml"]);
      expect(() => assertXlsxUnpacksSafely(zip)).toThrow(HttpError);
    });

    it("refuses extra bytes before the zip, which make JSZip shift every offset", async () => {
      const zip = Buffer.concat([Buffer.alloc(64), await smallThenBomb()]);

      expect(Object.keys((await JSZip.loadAsync(zip)).files)).toEqual(["a.xml", "b.xml"]);
      expect(() => assertXlsxUnpacksSafely(zip)).toThrow(HttpError);
    });

    it("refuses Zip64 markers, which send JSZip to a different directory", async () => {
      const zip = await smallThenBomb();
      zip.writeUInt16LE(0xffff, endRecord(zip) + 10);

      expect(() => assertXlsxUnpacksSafely(zip)).toThrow(expect.objectContaining({ status: 413 }));
    });

    it("lets an ordinary workbook through, and refuses an empty file", async () => {
      const file = await workbook([["name", "category", "price"], ["Plain Rice", "Rice & Noodles", 25]]);

      expect(() => assertXlsxUnpacksSafely(file)).not.toThrow();
      expect(() => assertXlsxUnpacksSafely(Buffer.alloc(0))).toThrow(HttpError);
    });
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

  const materials = [
    { name: "Iced tea powder", unit: "g" as const },
    { name: "Ice", unit: "g" as const },
    { name: "Cup", unit: "pc" as const },
  ];

  it("has a Products sheet with the import columns and a sample row in Drinks", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildImportTemplateXlsx(categories, materials)) as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Products")!;

    expect(sheet.getRow(1).values).toEqual([undefined, "name", "category", "price", "cost", "description"]);
    expect(sheet.getCell("A2").value).toBe("Sample Iced Tea");
    expect(sheet.getCell("B2").value).toBe("Drinks");
  });

  it("has a Recipes sheet whose sample uses real raw materials, so it imports as it is", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildImportTemplateXlsx(categories, materials)) as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Recipes")!;

    expect(sheet.getRow(1).values).toEqual([undefined, "product", "rawMaterial", "qtyPerServing"]);
    expect([sheet.getRow(2).values, sheet.getRow(3).values]).toEqual([
      [undefined, "Sample Iced Tea", "Iced tea powder", 100],
      [undefined, "Sample Iced Tea", "Ice", 100],
    ]);
  });

  it("offers the current categories and raw materials as dropdowns", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildImportTemplateXlsx(categories, materials)) as unknown as ArrayBuffer);

    expect(wb.getWorksheet("Categories")!.getColumn(1).values.slice(2)).toEqual(["Sizzling Plates", "Drinks", "Desserts"]);
    expect(wb.getWorksheet("Products")!.getCell("B10").dataValidation).toMatchObject({
      type: "list",
      formulae: ["'Categories'!$A$2:$A$4"],
    });
    expect(wb.getWorksheet("Raw materials")!.getColumn(2).values.slice(2)).toEqual(["g", "g", "pc"]);
    expect(wb.getWorksheet("Recipes")!.getCell("B10").dataValidation).toMatchObject({
      type: "list",
      formulae: ["'Raw materials'!$A$2:$A$4"],
    });
  });

  it("reads back as both tables", async () => {
    const result = await xlsxToImportCsv(await buildImportTemplateXlsx(categories, materials));

    expect(result).toMatchObject({ sheetName: "Products", rows: 1, recipes: { sheetName: "Recipes", rows: 2 } });
  });

  it("uses the first category for the sample when there is no Drinks category", async () => {
    const result = await xlsxToImportCsv(await buildImportTemplateXlsx([{ name: "Sizzling Plates" }]));

    expect(fromCSV(result.csvText)[0]).toMatchObject({ name: "Sample Iced Tea", category: "Sizzling Plates", price: "45" });
  });
});
