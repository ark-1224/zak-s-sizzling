import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { updateTaskStatusSchema } from "./schema";
import { listActiveTasks, updateTaskStatus } from "./service";

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
    res.json(await updateTaskStatus(req.params.id, status));
  } catch (err) {
    next(err);
  }
});
