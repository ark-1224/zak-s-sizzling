import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

// The writers only lay out a ReportTable; the report queries are replaced so no
// database is needed.
vi.mock("../../src/modules/reports/service", () => ({}));

import { renderCsv, renderPdf, renderXlsx, type ReportTable } from "../../src/modules/reports/export";

const table = (rows: ReportTable["rows"]): ReportTable => ({
  name: "profitability",
  title: "Profitability per item",
  period: "All-time sales",
  columns: [
    { header: "Product", kind: "text" },
    { header: "Cost (PHP)", kind: "money" },
    { header: "Price (PHP)", kind: "money" },
    { header: "Margin %", kind: "percent" },
    { header: "Qty sold", kind: "count" },
    { header: "Gross profit (PHP)", kind: "money" },
  ],
  rows,
});

const pageCount = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;

describe("CSV", () => {
  it("writes the header, two-decimal money, and a blank for a missing cost", () => {
    const csv = renderCsv(table([["Halo-Halo", 40, 90, 55.555, 12, 600], ["Plain Rice", null, 35, null, 0, null]]));

    expect(csv.split("\n")).toEqual([
      "Product,Cost (PHP),Price (PHP),Margin %,Qty sold,Gross profit (PHP)",
      "Halo-Halo,40.00,90.00,55.6,12,600.00",
      "Plain Rice,,35.00,,0,",
    ]);
  });

  it("quotes values containing commas or quotes", () => {
    const csv = renderCsv(table([['Sisig, "special"', 1, 2, 3, 4, 5]]));

    expect(csv.split("\n")[1].startsWith('"Sisig, ""special""",')).toBe(true);
  });
});

describe("Excel", () => {
  it("keeps numbers as numbers with money, percent and count formats", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await renderXlsx(table([["Halo-Halo", 40, 90, 55.6, 12, 600]])));
    const sheet = workbook.worksheets[0];

    expect(sheet.getRow(5).values).toEqual([undefined, "Halo-Halo", 40, 90, 55.6, 12, 600]);
    expect(sheet.getColumn(2).numFmt).toBe("#,##0.00");
    expect(sheet.getColumn(4).numFmt).toBe('0.0"%"');
    expect(sheet.getColumn(5).numFmt).toBe("#,##0");
  });
});

describe("PDF", () => {
  it("fits a short report on one page, with no blank extra page", async () => {
    const pdf = await renderPdf(table([["Halo-Halo", 40, 90, 55.6, 12, 600]]));

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
  });

  it("continues a long report onto more pages", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`Dish ${i + 1}`, 10, 20, 50, i, 10 * i]);

    const pdf = await renderPdf(table(rows));

    expect(pageCount(pdf)).toBeGreaterThanOrEqual(5);
  });

  it("still produces a page when the report is empty", async () => {
    const pdf = await renderPdf(table([]));

    expect(pageCount(pdf)).toBe(1);
  });
});
