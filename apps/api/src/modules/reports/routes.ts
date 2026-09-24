import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { toCSV } from "../../lib/csv";
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

reportsRouter.get("/sales", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    res.json(await getSalesReport(parseRange(req.query.range)));
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/top-products", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    res.json(await getTopProducts(parseLimit(req.query.limit, 10)));
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/inventory-movement", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    res.json(await getInventoryMovement());
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/profitability", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    res.json(await getProfitability());
  } catch (err) {
    next(err);
  }
});

// CSV is fully implemented; PDF/XLSX are not (would need pdfkit/exceljs — flagging
// rather than half-building them). Returns 501 for those so the frontend can show a
// clear message instead of failing silently.
reportsRouter.get("/export", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const format = req.query.format ?? "csv";
    if (format !== "csv") {
      throw new HttpError(501, `Export format "${format}" isn't implemented yet — only CSV is available.`);
    }

    const type = req.query.type;
    let csv: string;
    let filename: string;

    if (type === "top-products") {
      const rows = await getTopProducts(1000);
      csv = toCSV(rows.map((r) => ({ Product: r.productName, "Qty Sold": r.qtySold, "Revenue (PHP)": r.revenue })));
      filename = "top-products.csv";
    } else if (type === "profitability") {
      const rows = await getProfitability();
      csv = toCSV(
        rows.map((r) => ({
          Product: r.productName,
          "Cost (PHP)": r.cost ?? "",
          "Price (PHP)": r.price,
          "Margin %": r.marginPct !== null ? r.marginPct.toFixed(1) : "",
          "Qty Sold": r.qtySold,
          "Gross Profit (PHP)": r.grossProfit !== null ? r.grossProfit.toFixed(2) : "",
        }))
      );
      filename = "profitability.csv";
    } else if (type === "inventory-movement") {
      const rows = await getInventoryMovement();
      csv = toCSV(
        rows.map((r) => ({ Product: r.productName, "Qty Sold": r.qtySold, "Current Stock": r.currentStock ?? "" }))
      );
      filename = "inventory-movement.csv";
    } else {
      const rows = await getSalesReport(parseRange(req.query.range));
      csv = toCSV(rows.map((r) => ({ Period: r.bucket, Orders: r.orderCount, "Revenue (PHP)": r.revenue })));
      filename = "sales-report.csv";
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});
