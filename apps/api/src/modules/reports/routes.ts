import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { buildReportTable, EXPORT_CONTENT_TYPE, renderCsv, renderPdf, renderXlsx, type ExportFormat, type ReportType } from "./export";
import { getInventoryMovement, getProfitability, getSalesReport, getTopProducts } from "./service";

export const reportsRouter = Router();

function parseRange(value: unknown): "daily" | "weekly" | "monthly" {
  if (value === "weekly" || value === "monthly") return value;
  return "daily";
}

// A non-numeric ?limit (NaN) previously slipped past the default parameter (which
// only applies to undefined, not NaN) and silently produced an empty result via
// .slice(0, NaN); a negative value silently sliced from the end of the list instead
// of being rejected. Falls back to `fallback` for anything that isn't a positive
// integer, and caps the top end so a huge value can't force an unbounded query.
function parseLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, 1000);
}

reportsRouter.get("/sales", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await getSalesReport(parseRange(req.query.range)));
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/top-products", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await getTopProducts(parseLimit(req.query.limit, 10)));
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/inventory-movement", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await getInventoryMovement());
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/profitability", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await getProfitability());
  } catch (err) {
    next(err);
  }
});

// Export any report as CSV, Excel (.xlsx) or PDF (reports/export.ts). The three formats
// come from the same table, so they always carry the same columns and figures.
const REPORT_TYPES: ReportType[] = ["sales", "top-products", "profitability", "inventory-movement"];
const FORMATS: ExportFormat[] = ["csv", "xlsx", "pdf"];

reportsRouter.get("/export", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const format = (req.query.format ?? "csv") as ExportFormat;
    if (!FORMATS.includes(format)) throw new HttpError(400, `Unknown export format "${String(req.query.format)}" — use csv, xlsx or pdf.`);
    const type = (req.query.type ?? "sales") as ReportType;
    if (!REPORT_TYPES.includes(type)) throw new HttpError(400, `Unknown report "${String(req.query.type)}".`);

    const table = await buildReportTable(type, parseRange(req.query.range));
    const body = format === "csv" ? renderCsv(table) : format === "xlsx" ? await renderXlsx(table) : await renderPdf(table);

    res.setHeader("Content-Type", EXPORT_CONTENT_TYPE[format]);
    res.setHeader("Content-Disposition", `attachment; filename="${table.name}.${format}"`);
    res.send(body);
  } catch (err) {
    next(err);
  }
});
