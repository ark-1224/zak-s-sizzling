import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { parseId } from "../../lib/ids";
import { updateTaskStatusSchema } from "./schema";
import { handOverOrder, listActiveTasks, updateTaskStatus } from "./service";

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
