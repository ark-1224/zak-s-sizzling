import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { categoryOrderSchema, createCategorySchema, updateCategorySchema } from "./schema";
import { createCategory, deleteCategory, listCategories, parseCategoryId, reorderCategories, updateCategory } from "./service";

export const categoriesRouter = Router();

// Public: the kiosk's category rail. In the rail's order, with how many products each has.
categoriesRouter.get("/", async (req, res, next) => {
  try {
    res.json(await listCategories());
  } catch (err) {
    next(err);
  }
});

// Category management (Administrator only).
categoriesRouter.post("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.status(201).json(await createCategory(createCategorySchema.parse(req.body)));
  } catch (err) {
    next(err);
  }
});

// Declared before "/:id" so "order" isn't read as an id.
categoriesRouter.put("/order", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await reorderCategories(categoryOrderSchema.parse(req.body).ids));
  } catch (err) {
    next(err);
  }
});

categoriesRouter.put("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    res.json(await updateCategory(parseCategoryId(req.params.id), updateCategorySchema.parse(req.body)));
  } catch (err) {
    next(err);
  }
});

categoriesRouter.delete("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    await deleteCategory(parseCategoryId(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
