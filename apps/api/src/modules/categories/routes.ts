import { Router } from "express";
import { prisma } from "../../lib/prisma";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
    res.json(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        sortOrder: c.sortOrder,
        isNew: c.isNew,
      }))
    );
  } catch (err) {
    next(err);
  }
});
