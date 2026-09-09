import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { createUserSchema, updateUserSchema } from "./schema";
import { createStaffUser, listStaffUsers, updateStaffUser } from "./service";

export const usersRouter = Router();

usersRouter.get("/me", authenticate, (req: AuthenticatedRequest, res) => {
  res.json(req.user);
});

// User account administration is Admin-only per the manuscript's Admin Management
// requirements — Staff can view/confirm orders but doesn't provision accounts.
usersRouter.get("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await listStaffUsers());
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);
    res.status(201).json(await createStaffUser(body));
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id", authenticate, authorize("admin"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = updateUserSchema.parse(req.body);
    res.json(await updateStaffUser(req.params.id, body, req.user!.id));
  } catch (err) {
    next(err);
  }
});
