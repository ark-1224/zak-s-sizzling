import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { parseId } from "../../lib/ids";
import { cancelKitchenOrderSchema, updateTaskStatusSchema } from "./schema";
import { cancelKitchenOrder, handOverOrder, listActiveTasks, updateTaskStatus } from "./service";

export const kitchenRouter = Router();

kitchenRouter.get("/tasks", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    res.json(await listActiveTasks());
  } catch (err) {
    next(err);
  }
});

kitchenRouter.patch("/tasks/:id", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const { status } = updateTaskStatusSchema.parse(req.body);
    res.json(await updateTaskStatus(parseId(req.params.id, "Kitchen task not found"), status));
  } catch (err) {
    next(err);
  }
});

// The kitchen gives a ready order to the customer (ready → completed).
kitchenRouter.post("/orders/:id/handed-over", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    await handOverOrder(parseId(req.params.id, "Order not found"));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// The kitchen cancels a paid order that hasn't been handed over, with a reason.
kitchenRouter.post("/orders/:id/cancel", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const orderId = parseId(req.params.id, "Order not found");
    const { reason } = cancelKitchenOrderSchema.parse(req.body);
    await cancelKitchenOrder(orderId, reason, req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
