import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";

export const usersRouter = Router();

usersRouter.get("/me", authenticate, (req: AuthenticatedRequest, res) => {
  res.json(req.user);
});
