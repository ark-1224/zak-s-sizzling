import { Router } from "express";
import { HttpError } from "../../middleware/errorHandler";
import { getProductById, listProducts } from "./service";

export const productsRouter = Router();

// GET /api/products?category=&search= — Sprint 1 read-only catalog
productsRouter.get("/", async (req, res, next) => {
  try {
    const products = await listProducts();
    res.json(products);
  } catch (err) {
    next(err);
  }
});

productsRouter.get("/:id", async (req, res, next) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) throw new HttpError(404, "Product not found");
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// TODO(Sprint 4): GET /barcode/:code, POST /, PUT /:id, DELETE /:id
