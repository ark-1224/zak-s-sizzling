import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { parseId } from "../../lib/ids";
import { createPurchaseSchema, priceHistoryQuerySchema, purchaseListQuerySchema, shoppingListQuerySchema } from "./schema";
import { createPurchase, getPriceHistory, getPurchase, listPurchases } from "./service";
import { getShoppingList } from "./shoppingList";

// Market purchases, prices and the shopping list: the owner's (Administrator's) work,
// since they carry prices and costs.
export const purchasingRouter = Router();

purchasingRouter.get("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await listPurchases(purchaseListQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
});

purchasingRouter.post("/", authenticate, authorize("admin"), async (req: AuthenticatedRequest, res, next) => {
  try {
    res.status(201).json(await createPurchase(createPurchaseSchema.parse(req.body), req.user!.id));
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get("/prices", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const { kind, itemId } = priceHistoryQuerySchema.parse(req.query);
    res.json(await getPriceHistory(kind, itemId));
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get("/shopping-list", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await getShoppingList(shoppingListQuerySchema.parse(req.query).days));
  } catch (err) {
    next(err);
  }
});

purchasingRouter.get("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await getPurchase(parseId(req.params.id, "Purchase not found")));
  } catch (err) {
    next(err);
  }
});
