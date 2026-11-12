import ExcelJS from "exceljs";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { CATEGORY, RAW_MATERIALS } from "./fixtures";
import { app, loginAs } from "./helpers";

// Bulk import from Excel (POST /api/products/import-xlsx, then the existing
// POST /api/products/bulk-import), and the Excel template
// (GET /api/products/import-template?format=xlsx). Products created here have names
// starting with "XLSX Test", so other test files never depend on them.

let admin: string;

beforeAll(async () => {
  admin = await loginAs("admin");
});

async function xlsxBase64(rows: ExcelJS.CellValue[][], recipeRows?: ExcelJS.CellValue[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("New items");
  for (const row of rows) sheet.addRow(row);
  if (recipeRows) {
    const recipes = wb.addWorksheet("Recipes");
    for (const row of recipeRows) recipes.addRow(row);
  }
  return Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
}

const convert = (fileBase64: unknown) =>
  request(app).post("/api/products/import-xlsx").set("Authorization", `Bearer ${admin}`).send({ fileBase64 });
const bulkImport = (csvText: string, dryRun: boolean, recipesCsvText?: string) =>
  request(app).post("/api/products/bulk-import").set("Authorization", `Bearer ${admin}`).send({ csvText, recipesCsvText, dryRun });

describe("importing products from an Excel file", () => {
  it("previews the sheet's rows with the same checks as a CSV, saving nothing", async () => {
    const file = await xlsxBase64(
      [
        ["name", "category", "price"],
        ["XLSX Test Preview Tea", CATEGORY.name, 45],
        ["XLSX Test Preview Bad", "No Such Category", 50],
      ],
      [
        ["product", "rawMaterial", "qtyPerServing"],
        ["XLSX Test Preview Tea", RAW_MATERIALS.rice.name, 10],
      ]
    );

    const converted = await convert(file);
    const preview = await bulkImport(converted.body.csvText, true, converted.body.recipes.csvText);

    expect(converted.status).toBe(200);
    expect(converted.body).toMatchObject({ sheetName: "New items", rows: 2, ignoredColumns: [], recipes: { sheetName: "Recipes", rows: 1 } });
    expect(preview.body).toMatchObject({ total: 2, created: 1, errors: 1, dryRun: true });
    expect(preview.body.results[1]).toMatchObject({ row: 3, status: "error", message: 'Unknown category "No Such Category"' });
    expect(await prisma.product.count({ where: { name: { startsWith: "XLSX Test Preview" } } })).toBe(0);
  });

  it("imports a dish with its bill of materials, leaving out the old stock columns", async () => {
    const file = await xlsxBase64(
      [
        ["Name", "Category", "Price", "Cost", "Stock qty"],
        ["XLSX Test Calamansi Juice", CATEGORY.name, 55, 22.5, 30],
      ],
      [
        ["Product", "Raw material", "Qty per serving"],
        ["XLSX Test Calamansi Juice", RAW_MATERIALS.rice.name, 50],
      ]
    );

    const converted = await convert(file);
    const result = await bulkImport(converted.body.csvText, false, converted.body.recipes.csvText);

    expect(converted.body.ignoredColumns).toEqual(["Stock qty"]);
    expect(result.body).toMatchObject({ total: 1, created: 1, errors: 0, recipes: { dishes: 1 } });
    const saved = await prisma.product.findFirstOrThrow({
      where: { name: "XLSX Test Calamansi Juice" },
      include: { recipeItems: { include: { rawMaterial: true } } },
    });
    expect(saved).toMatchObject({ tracking: "recipe" });
    expect(saved.price.toString()).toBe("55");
    expect(saved.cost?.toString()).toBe("22.5");
    expect(saved.recipeItems.map((r) => [r.rawMaterial.name, r.qtyPerServing.toString()])).toEqual([[RAW_MATERIALS.rice.name, "50"]]);
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
    const preview = await bulkImport(converted.body.csvText, true, converted.body.recipes.csvText);

    expect(preview.body).toMatchObject({ total: 1, errors: 0, recipes: { dishes: 1, errors: 0 } });
  });

  it("is still a CSV without ?format=xlsx", async () => {
    const res = await request(app).get("/api/products/import-template").set("Authorization", `Bearer ${admin}`);

    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
  });
});
