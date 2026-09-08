import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { adjustStockSchema } from "./schema";
import { adjustStock, listLowStock } from "./service";

export const inventoryRouter = Router();

inventoryRouter.get("/low-stock", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    res.json(await listLowStock());
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch("/:productId", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const body = adjustStockSchema.parse(req.body);
    const product = await adjustStock(req.params.productId, body);
    res.json(product);
  } catch (err) {
    next(err);
  }
});
