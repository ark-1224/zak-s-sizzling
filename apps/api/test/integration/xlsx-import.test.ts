import ExcelJS from "exceljs";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { CATEGORY } from "./fixtures";
import { app, loginAs } from "./helpers";

// Bulk import from Excel (POST /api/products/import-xlsx, then the existing
// POST /api/products/bulk-import), and the Excel template
// (GET /api/products/import-template?format=xlsx). Products created here have names
// starting with "XLSX Test", so other test files never depend on them.

let admin: string;

beforeAll(async () => {
  admin = await loginAs("admin");
});

async function xlsxBase64(rows: ExcelJS.CellValue[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("New items");
  sheet.getColumn(2).numFmt = "@";
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
}

const convert = (fileBase64: unknown) =>
  request(app).post("/api/products/import-xlsx").set("Authorization", `Bearer ${admin}`).send({ fileBase64 });
const bulkImport = (csvText: string, dryRun: boolean) =>
  request(app).post("/api/products/bulk-import").set("Authorization", `Bearer ${admin}`).send({ csvText, dryRun });

describe("importing products from an Excel file", () => {
  it("previews the sheet's rows with the same checks as a CSV, saving nothing", async () => {
    const file = await xlsxBase64([
      ["name", "barcode", "category", "price", "stockQty"],
      ["XLSX Test Preview Tea", "", CATEGORY.name, 45, 10],
      ["XLSX Test Preview Bad", "", "No Such Category", 50, 3],
    ]);

    const converted = await convert(file);
    const preview = await bulkImport(converted.body.csvText, true);

    expect(converted.status).toBe(200);
    expect(converted.body).toMatchObject({ sheetName: "New items", rows: 2, ignoredColumns: [] });
    expect(preview.body).toMatchObject({ total: 2, created: 1, errors: 1, dryRun: true });
    expect(preview.body.results[1]).toMatchObject({ row: 3, status: "error", message: 'Unknown category "No Such Category"' });
    expect(await prisma.product.count({ where: { name: { startsWith: "XLSX Test Preview" } } })).toBe(0);
  });

  it("imports the rows, keeping a text barcode's leading zeros", async () => {
    const file = await xlsxBase64([
      ["Name", "Barcode", "Category", "Price", "Cost", "Stock qty", "Min stock threshold"],
      ["XLSX Test Calamansi Juice", "0048000999001", CATEGORY.name, 55, 22.5, 30, 6],
    ]);

    const converted = await convert(file);
    const result = await bulkImport(converted.body.csvText, false);

    expect(result.body).toMatchObject({ total: 1, created: 1, errors: 0 });
    const saved = await prisma.product.findFirstOrThrow({ where: { name: "XLSX Test Calamansi Juice" }, include: { inventory: true } });
    expect(saved).toMatchObject({ barcode: "0048000999001" });
    expect(saved.price.toString()).toBe("55");
    expect(saved.cost?.toString()).toBe("22.5");
    expect(saved.inventory).toMatchObject({ stockQty: 30, minStockThreshold: 6 });
  });

  it("refuses a request without a file", async () => {
    const res = await convert(undefined);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("fileBase64 is required");
  });

  it("refuses a file that isn't an .xlsx workbook", async () => {
    const res = await convert(Buffer.from("name,category,price\nTea,Drinks,45").toString("base64"));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't an Excel workbook/);
  });
});

describe("the Excel import template", () => {
  const download = () =>
    request(app)
      .get("/api/products/import-template?format=xlsx")
      .set("Authorization", `Bearer ${admin}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });

  it("downloads as an .xlsx file listing the categories that exist", async () => {
    const res = await download();

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="product_import_template.xlsx"');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
    expect(wb.getWorksheet("Categories")!.getColumn(1).values.slice(2)).toEqual(categories.map((c) => c.name));
  });

  it("passes the import's checks as it comes", async () => {
    const res = await download();

    const converted = await convert(res.body.toString("base64"));
    const preview = await bulkImport(converted.body.csvText, true);

    expect(preview.body).toMatchObject({ total: 1, errors: 0 });
  });

  it("is still a CSV without ?format=xlsx", async () => {
    const res = await request(app).get("/api/products/import-template").set("Authorization", `Bearer ${admin}`);

    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
  });
});
