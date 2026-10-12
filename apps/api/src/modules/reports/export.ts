import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { getInventoryMovement, getProfitability, getSalesReport, getTopProducts } from "./service";

// Report export in three formats (CSV, Excel, PDF). Each report is first turned into
// one ReportTable, and the three writers below only lay that table out, so the formats
// always carry the same columns and figures.

export type ReportType = "sales" | "top-products" | "profitability" | "inventory-movement";
export type ExportFormat = "csv" | "xlsx" | "pdf";
type Range = "daily" | "weekly" | "monthly";
type ColumnKind = "text" | "count" | "money" | "percent";

export interface ReportColumn {
  header: string;
  kind: ColumnKind;
}

export interface ReportTable {
  /** File name without extension, e.g. "sales-report-daily". */
  name: string;
  title: string;
  /** What the figures cover, e.g. "Last 14 days, by day". */
  period: string;
  columns: ReportColumn[];
  /** One value per column; null means "not recorded" (shown blank). */
  rows: (string | number | null)[][];
}

const RANGE_PERIOD: Record<Range, string> = {
  daily: "Last 14 days, by day",
  weekly: "Last 8 weeks, by week",
  monthly: "Last 6 months, by month",
};

export async function buildReportTable(type: ReportType, range: Range): Promise<ReportTable> {
  if (type === "top-products") {
    const rows = await getTopProducts(1000);
    return {
      name: "top-products",
      title: "Top-selling products",
      period: "All time",
      columns: [
        { header: "Product", kind: "text" },
        { header: "Qty sold", kind: "count" },
        { header: "Revenue (PHP)", kind: "money" },
      ],
      rows: rows.map((r) => [r.productName, r.qtySold, r.revenue]),
    };
  }
  if (type === "profitability") {
    const rows = await getProfitability();
    return {
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
      rows: rows.map((r) => [r.productName, r.cost, r.price, r.marginPct, r.qtySold, r.grossProfit]),
    };
  }
  if (type === "inventory-movement") {
    const rows = await getInventoryMovement();
    return {
      name: "inventory-movement",
      title: "Inventory movement",
      period: "Sold all time, stock now",
      columns: [
        { header: "Product", kind: "text" },
        { header: "Qty sold", kind: "count" },
        { header: "Current stock", kind: "count" },
      ],
      rows: rows.map((r) => [r.productName, r.qtySold, r.currentStock]),
    };
  }
  const rows = await getSalesReport(range);
  return {
    name: `sales-report-${range}`,
    title: "Sales report",
    period: RANGE_PERIOD[range],
    columns: [
      { header: "Period", kind: "text" },
      { header: "Orders", kind: "count" },
      { header: "Revenue (PHP)", kind: "money" },
    ],
    rows: rows.map((r) => [r.bucket, r.orderCount, r.revenue]),
  };
}

/** Plain-text form of a value, used by CSV and PDF. */
function formatValue(value: string | number | null, kind: ColumnKind, forPdf: boolean): string {
  if (value === null || value === "") return "";
  if (typeof value === "string") return value;
  if (kind === "money") {
    const fixed = value.toFixed(2);
    return forPdf ? `PHP ${Number(fixed).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : fixed;
  }
  if (kind === "percent") return forPdf ? `${value.toFixed(1)}%` : value.toFixed(1);
  return String(value);
}

/** Always starts with the header row, even when the report has no rows yet. */
export function renderCsv(table: ReportTable): string {
  const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [
    table.columns.map((c) => escape(c.header)).join(","),
    ...table.rows.map((row) => row.map((v, i) => escape(formatValue(v, table.columns[i].kind, false))).join(",")),
  ];
  return lines.join("\n");
}

const generatedAt = () =>
  new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

export async function renderXlsx(table: ReportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zak's Sizzling Hub";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(table.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }] });

  sheet.addRow([`Zak's Sizzling Hub — ${table.title}`]).font = { bold: true, size: 14 };
  sheet.addRow([`${table.period} · generated ${generatedAt()}`]).font = { color: { argb: "FF6B665C" } };
  sheet.addRow([]);
  const header = sheet.addRow(table.columns.map((c) => c.header));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F0EB" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFB5502A" } } };
  });

  for (const row of table.rows) {
    // Numbers stay numbers, so the sheet can sum and sort them.
    sheet.addRow(row.map((v) => (v === null ? null : v)));
  }

  table.columns.forEach((column, i) => {
    const col = sheet.getColumn(i + 1);
    if (column.kind === "money") col.numFmt = "#,##0.00";
    if (column.kind === "percent") col.numFmt = '0.0"%"';
    if (column.kind === "count") col.numFmt = "#,##0";
    const longest = Math.max(column.header.length, ...table.rows.map((r) => formatValue(r[i], column.kind, true).length));
    col.width = Math.min(Math.max(longest + 2, 10), 50);
    if (column.kind !== "text") col.alignment = { horizontal: "right" };
  });
  if (table.rows.length > 0) {
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: table.columns.length } };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function renderPdf(table: ReportTable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Wide reports (more than four columns, e.g. Profitability) are printed sideways.
    const layout = table.columns.length > 4 ? "landscape" : "portrait";
    const doc = new PDFDocument({
      size: "A4",
      layout,
      margin: 48,
      bufferPages: true,
      info: { Title: `${table.title} — Zak's Sizzling Hub`, Author: "Zak's Sizzling Hub" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const FONT_SIZE = 9.5;
    const PAD = 6;
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const cells = table.rows.map((row) => row.map((v, i) => formatValue(v, table.columns[i].kind, true)));

    // Number columns are as wide as their widest value or header; text columns share the rest.
    const measure = (text: string, bold: boolean) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(FONT_SIZE).widthOfString(text);
    const natural = table.columns.map((c, i) => Math.max(measure(c.header, true), ...cells.map((r) => measure(r[i], false))) + PAD * 2);
    const textCount = table.columns.filter((c) => c.kind === "text").length || 1;
    const numbersWidth = table.columns.reduce((sum, c, i) => (c.kind === "text" ? sum : sum + natural[i]), 0);
    const textWidth = Math.max(120, (width - numbersWidth) / textCount);
    const widths = table.columns.map((c, i) => (c.kind === "text" ? textWidth : natural[i]));

    /** Shortens text with "…" until it fits, so a cell never wraps onto a second line. */
    const fit = (text: string, max: number) => {
      if (doc.widthOfString(text) <= max) return text;
      let cut = text;
      while (cut.length > 1 && doc.widthOfString(`${cut}…`) > max) cut = cut.slice(0, -1);
      return `${cut.trimEnd()}…`;
    };

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#1c1b18").text(`Zak's Sizzling Hub — ${table.title}`, left, doc.page.margins.top);
    doc.font("Helvetica").fontSize(10).fillColor("#6b665c").text(`${table.period} · generated ${generatedAt()}`);
    doc.moveDown(1);

    const rowHeight = 20;
    const drawRow = (values: string[], y: number, opts: { bold?: boolean; fill?: string }) => {
      if (opts.fill) doc.rect(left, y, width, rowHeight).fill(opts.fill);
      doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(FONT_SIZE).fillColor("#1c1b18");
      let x = left;
      values.forEach((value, i) => {
        const inner = widths[i] - PAD * 2;
        const text = fit(value, inner);
        const offset = table.columns[i].kind === "text" ? 0 : inner - doc.widthOfString(text);
        doc.text(text, x + PAD + offset, y + 6, { lineBreak: false });
        x += widths[i];
      });
    };
    const drawHeader = (y: number) => {
      drawRow(table.columns.map((c) => c.header), y, { bold: true, fill: "#f2f0eb" });
      doc.moveTo(left, y + rowHeight).lineTo(left + width, y + rowHeight).lineWidth(1).strokeColor("#b5502a").stroke();
      return y + rowHeight;
    };

    let y = drawHeader(doc.y);
    if (table.rows.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor("#6b665c").text("No data for this period yet.", left + PAD, y + 8, { lineBreak: false });
    }
    cells.forEach((row, index) => {
      if (y + rowHeight > bottom) {
        doc.addPage();
        y = drawHeader(doc.page.margins.top);
      }
      drawRow(row, y, { fill: index % 2 === 1 ? "#faf9f6" : undefined });
      y += rowHeight;
    });

    // "Page X of Y" on every page, once the page count is known. The footer sits in the
    // bottom margin, so the margin is lifted while writing it; otherwise pdfkit would
    // start a new page for it.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const margin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8.5).fillColor("#6b665c");
      const label = `Page ${i + 1} of ${range.count}`;
      doc.text(label, left + (width - doc.widthOfString(label)) / 2, doc.page.height - margin + 16, { lineBreak: false });
      doc.page.margins.bottom = margin;
    }
    doc.end();
  });
}

export const EXPORT_CONTENT_TYPE: Record<ExportFormat, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};
