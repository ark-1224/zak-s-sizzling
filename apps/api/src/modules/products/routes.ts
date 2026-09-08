import { Router } from "express";
import { Prisma } from "@prisma/client";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { createProductSchema, updateProductSchema } from "./schema";
import {
  createProduct,
  deleteProduct,
  getProductByBarcode,
  getProductById,
  listProducts,
  updateProduct,
} from "./service";

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

// Barcode lookup for the admin scanner (Sprint 4) — before /:id so "barcode" isn't
// swallowed as a product id.
productsRouter.get("/barcode/:code", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const product = await getProductByBarcode(req.params.code);
    if (!product) throw new HttpError(404, "No product with that barcode");
    res.json(product);
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

productsRouter.post("/", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const body = createProductSchema.parse(req.body);
    const product = await createProduct(body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

productsRouter.put("/:id", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const body = updateProductSchema.parse(req.body);
    const product = await updateProduct(req.params.id, body);
    res.json(product);
  } catch (err) {
    next(err);
  }
});

productsRouter.delete("/:id", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    await deleteProduct(req.params.id);
    res.status(204).send();
  } catch (err) {
    // Products referenced by past orders are protected by a FK RESTRICT constraint —
    // deleting would corrupt order history, so point the admin at the safer
    // alternative. This specific violation surfaces as PrismaClientUnknownRequestError
    // (Postgres code 23001, "restrict_violation") rather than a mapped P-code, since
    // Prisma doesn't have a known-error mapping for RESTRICT specifically — confirmed
    // against the actual runtime error, not just Prisma's docs.
    const isForeignKeyRestriction =
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") ||
      (err instanceof Prisma.PrismaClientUnknownRequestError && err.message.includes("foreign key constraint"));
    if (isForeignKeyRestriction) {
      return next(new HttpError(409, "This product has existing orders and can't be deleted — mark it unavailable instead."));
    }
    next(err);
  }
});
