import ExcelJS from "exceljs";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS } from "./fixtures";
import { app, loginAs } from "./helpers";

// Report export as CSV, Excel and PDF (GET /api/reports/export, reports/export.ts).
// Reads only: the inventory movement report always lists every product, so its
// figures can be checked against the database whatever other test files have done.

let admin: string;

beforeAll(async () => {
  admin = await loginAs("admin");
});

/** Collects a binary response body (Excel, PDF) into a Buffer. */
const download = (query: string) =>
  request(app)
    .get(`/api/reports/export?${query}`)
    .set("Authorization", `Bearer ${admin}`)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });

const REPORTS = ["sales", "top-products", "profitability", "inventory-movement"] as const;
const FORMATS = [
  ["csv", "text/csv"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["pdf", "application/pdf"],
] as const;

describe("every report in every format", () => {
  it.each(REPORTS.flatMap((type) => FORMATS.map(([format, contentType]) => [type, format, contentType])))(
    "%s as %s",
    async (type, format, contentType) => {
      const res = await download(`type=${type}&format=${format}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain(contentType);
      const name = type === "sales" ? "sales-report-daily" : type;
      expect(res.headers["content-disposition"]).toBe(`attachment; filename="${name}.${format}"`);
      expect((res.body as Buffer).length).toBeGreaterThan(0);
    }
  );
});

describe("the CSV file", () => {
  it("always starts with its header row, even before anything has sold", async () => {
    const res = await request(app).get("/api/reports/export?type=top-products&format=csv").set("Authorization", `Bearer ${admin}`);

    expect(res.text.split("\n")[0]).toBe("Product,Qty sold,Revenue (PHP)");
  });

  it("gives the sales report an average order value column", async () => {
    const res = await request(app).get("/api/reports/export?type=sales&format=csv").set("Authorization", `Bearer ${admin}`);

    expect(res.text.split("\n")[0]).toBe("Period,Orders,Revenue (PHP),Average order value (PHP)");
  });
});

describe("average order value", () => {
  it("is each period's revenue divided by its paid orders", async () => {
    const res = await request(app).get("/api/reports/sales?range=monthly").set("Authorization", `Bearer ${admin}`);

    expect(res.status).toBe(200);
    for (const point of res.body as { orderCount: number; revenue: number; averageOrderValue: number }[]) {
      expect(point.orderCount).toBeGreaterThan(0);
      expect(point.averageOrderValue).toBeCloseTo(point.revenue / point.orderCount, 2);
    }
  });
});

describe("the Excel file", () => {
  it("has a title, the period, a header row, and numbers stored as numbers", async () => {
    const res = await download("type=inventory-movement&format=xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const sheet = workbook.worksheets[0];

    expect(sheet.getCell("A1").value).toBe("Zak's Sizzling Hub — Inventory movement");
    expect(String(sheet.getCell("A2").value)).toMatch(/^Sold all time, stock now · generated /);
    expect(sheet.getRow(4).values).toEqual([undefined, "Product", "Qty sold", "Current stock"]);

    const { stockQty } = await prisma.inventory.findUniqueOrThrow({ where: { productId: PRODUCTS.water.id } });
    let waterRow: ExcelJS.Row | undefined;
    sheet.eachRow((row) => {
      if (row.getCell(1).value === PRODUCTS.water.name) waterRow = row;
    });
    expect(waterRow).toBeDefined();
    expect(typeof waterRow!.getCell(2).value).toBe("number");
    expect(waterRow!.getCell(3).value).toBe(stockQty);
  });

  it("lists every product, one row each", async () => {
    const res = await download("type=inventory-movement&format=xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);

    expect(workbook.worksheets[0].rowCount - 4).toBe(await prisma.product.count());
  });

  it("names the sales file after its range", async () => {
    const res = await download("type=sales&format=xlsx&range=monthly");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);

    expect(res.headers["content-disposition"]).toContain('filename="sales-report-monthly.xlsx"');
    expect(String(workbook.worksheets[0].getCell("A2").value)).toMatch(/^Last 6 months, by month/);
  });
});

describe("the PDF file", () => {
  it("is a complete PDF document with at least one page", async () => {
    const res = await download("type=profitability&format=pdf");
    const pdf = res.body as Buffer;

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.subarray(-6).toString()).toContain("%%EOF");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBeGreaterThanOrEqual(1);
  });
});

describe("bad requests", () => {
  it.each([
    ["an unknown format", "type=sales&format=docx", /Unknown export format "docx"/],
    ["an unknown report", "type=payroll&format=csv", /Unknown report "payroll"/],
  ])("refuses %s with 400", async (_label, query, message) => {
    const res = await request(app).get(`/api/reports/export?${query}`).set("Authorization", `Bearer ${admin}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });
});
