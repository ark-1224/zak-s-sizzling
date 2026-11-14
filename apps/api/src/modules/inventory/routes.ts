import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { parseId } from "../../lib/ids";
import { withAdminFieldsForRole } from "../products/service";
import { adjustStockSchema, createStockCountSchema, stockMovementQuerySchema } from "./schema";
import { createStockCount, getStockCount, listStockCounts } from "./counts";
import { listFreshnessWarnings } from "./freshness";
import { listStockItems } from "../purchasing/stockItems";
import { adjustStock, listLowStock, listStockAdjustments } from "./service";
import { listStockMovements } from "./movements";

export const inventoryRouter = Router();

// Every raw material in use and ready-made item, for the count sheet and the purchase
// form. Cost per unit is the owner's (Administrator's) information.
inventoryRouter.get("/items", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const items = await listStockItems();
    res.json(req.user?.role === "admin" ? items : items.map(({ costPerBase: _cost, ...rest }) => rest));
  } catch (err) {
    next(err);
  }
});

// Items to use soon or throw out (shelf life from the purchase date, or a printed date).
inventoryRouter.get("/freshness", authenticate, authorize("admin", "staff"), async (_req, res, next) => {
  try {
    res.json(await listFreshnessWarnings());
  } catch (err) {
    next(err);
  }
});

// The count sheet: staff count the stock; the variance's peso value is for the Administrator.
inventoryRouter.get("/counts", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(await listStockCounts(req.user?.role));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post("/counts", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const count = await createStockCount(createStockCountSchema.parse(req.body), req.user!.id);
    res.status(201).json(await getStockCount(count.id, req.user?.role));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get("/counts/:id", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(await getStockCount(parseId(req.params.id, "Stock count not found"), req.user?.role));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get("/low-stock", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(withAdminFieldsForRole(await listLowStock(), req.user?.role));
  } catch (err) {
    next(err);
  }
});

// The Stock movements tab: every stock change of raw materials and ready-made items, newest first.
inventoryRouter.get("/movements", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    res.json(await listStockMovements(stockMovementQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get("/adjustments", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const productId = typeof req.query.productId === "string" ? parseId(req.query.productId, "Product not found") : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await listStockAdjustments({ productId, limit }));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch("/:productId", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = adjustStockSchema.parse(req.body);
    const product = await adjustStock(parseId(req.params.productId, "No inventory record for this product"), body, req.user!.id);
    res.json(withAdminFieldsForRole(product, req.user?.role));
  } catch (err) {
    next(err);
  }
});
