import { Router } from "express";
import { Prisma } from "@prisma/client";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { fromCSV, toCSV } from "../../lib/csv";
import { createProductSchema, updateProductSchema } from "./schema";
import { bulkImportProducts } from "./bulkImport";
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

// Reference sheet with required headers, used by /admin/import's "Download template" link.
productsRouter.get("/import-template", authenticate, authorize("admin", "staff"), (req, res) => {
  const sample = {
    name: "Sample Iced Tea",
    barcode: "",
    category: "Drinks",
    price: 45,
    cost: 20,
    stockQty: 25,
    minStockThreshold: 5,
    description: "Optional",
  };
  const csv = toCSV([sample]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="product_import_template.csv"');
  res.send(csv);
});

productsRouter.post("/bulk-import", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const csvText = req.body?.csvText;
    if (typeof csvText !== "string" || !csvText.trim()) throw new HttpError(400, "csvText is required");

    const rows = fromCSV(csvText);
    if (rows.length === 0) throw new HttpError(400, "No rows found in the CSV");
    const REQUIRED_HEADERS = ["name", "category", "price"] as const;
    const missingHeaders = REQUIRED_HEADERS.filter((h) => !(h in rows[0]));
    if (missingHeaders.length > 0) throw new HttpError(400, `Missing required column(s): ${missingHeaders.join(", ")}`);

    res.json(await bulkImportProducts(rows));
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
