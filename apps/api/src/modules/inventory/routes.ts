import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { adjustStockSchema } from "./schema";
import { adjustStock, listLowStock, listStockAdjustments } from "./service";

export const inventoryRouter = Router();

inventoryRouter.get("/low-stock", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    res.json(await listLowStock());
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get("/adjustments", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await listStockAdjustments({ productId, limit }));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch("/:productId", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = adjustStockSchema.parse(req.body);
    const product = await adjustStock(req.params.productId, body, req.user!.id);
    res.json(product);
  } catch (err) {
    next(err);
  }
});
