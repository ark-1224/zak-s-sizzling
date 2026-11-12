import { Router } from "express";
import { Prisma } from "@prisma/client";
import { authenticate, optionalAuthenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { fromCSV, toCSV } from "../../lib/csv";
import { createProductSchema, productIdSchema, updateProductSchema } from "./schema";
import { IMPORT_HEADERS, RECIPE_HEADERS, bulkImportProducts, canonicalRows } from "./bulkImport";
import { buildImportTemplateXlsx, xlsxToImportCsv } from "./xlsxImport";
import { prisma } from "../../lib/prisma";
import { deleteProductImage, getProductImage, saveProductImage, uploadImageSchema } from "./image";
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  updateProduct,
  withAdminFieldsForRole,
} from "./service";

export const productsRouter = Router();

/** A malformed id is simply a product that doesn't exist, not a server error (defect D-01). */
function parseProductId(id: string): string {
  if (!productIdSchema.safeParse(id).success) throw new HttpError(404, "Product not found");
  return id;
}

// GET /api/products?category=&search= — Sprint 1 read-only catalog. Public for the
// kiosk; an admin token additionally unlocks each product's cost.
productsRouter.get("/", optionalAuthenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const products = await listProducts();
    res.json(withAdminFieldsForRole(products, req.user?.role));
  } catch (err) {
    next(err);
  }
});

// Import templates, used by /admin/import's "Download template" links. Registered
// before GET /:id, which is public: otherwise "import-template" is taken as a product id
// and this admin-only route is never reached (defect D-02).
// ?format=xlsx gives the Excel workbook (Products and Recipes sheets, with dropdowns of
// the categories and raw materials); otherwise CSV, ?type=recipes for the Recipes table.
productsRouter.get("/import-template", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const materials = await prisma.rawMaterial.findMany({ orderBy: { name: "asc" }, select: { name: true, unit: true } });
    if (req.query.format === "xlsx") {
      const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { name: true } });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="product_import_template.xlsx"');
      res.send(await buildImportTemplateXlsx(categories, materials));
      return;
    }
    const csv =
      req.query.type === "recipes"
        ? toCSV(
            (materials.length ? materials.slice(0, 2) : [{ name: "Iced tea mix", unit: "g" }]).map((m) => ({
              product: "Sample Iced Tea",
              rawMaterial: m.name,
              qtyPerServing: m.unit === "pc" ? 1 : 100,
            }))
          )
        : toCSV([{ name: "Sample Iced Tea", category: "Drinks", price: 45, cost: 12, description: "Optional" }]);
    const file = req.query.type === "recipes" ? "recipe_import_template.csv" : "product_import_template.csv";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

productsRouter.get("/:id", optionalAuthenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const product = await getProductById(parseProductId(req.params.id));
    if (!product) throw new HttpError(404, "Product not found");
    res.json(withAdminFieldsForRole(product, req.user?.role));
  } catch (err) {
    next(err);
  }
});

// A product's photo (products/image.ts). Public, like the menu. The URL carries the
// photo's version (?v=), so a browser can keep it for a year: a new photo gets a new URL.
// The web app is on another origin, so the photo is marked as loadable cross-origin
// (helmet's default would block it from the kiosk page).
productsRouter.get("/:id/image", async (req, res, next) => {
  try {
    const image = await getProductImage(parseProductId(req.params.id));
    if (!image) throw new HttpError(404, "This product has no photo");
    res.set({
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Last-Modified": image.updatedAt.toUTCString(),
    });
    res.send(Buffer.from(image.data));
  } catch (err) {
    next(err);
  }
});

// Upload or replace a product's photo: { contentType, imageBase64 }. Admin only.
productsRouter.put("/:id/image", authenticate, authorize("admin"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = parseProductId(req.params.id);
    await saveProductImage(id, uploadImageSchema.parse(req.body));
    res.json(withAdminFieldsForRole((await getProductById(id))!, req.user?.role));
  } catch (err) {
    next(err);
  }
});

productsRouter.delete("/:id/image", authenticate, authorize("admin"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = parseProductId(req.params.id);
    await deleteProductImage(id);
    res.json(withAdminFieldsForRole((await getProductById(id))!, req.user?.role));
  } catch (err) {
    next(err);
  }
});

/** Parses one of the import's CSV texts; empty text is an empty table. */
function parseImportTable(text: unknown, label: string, headers: readonly string[], required: readonly string[]) {
  if (text === undefined || text === null || (typeof text === "string" && !text.trim())) return [];
  if (typeof text !== "string") throw new HttpError(400, `${label} must be CSV text`);
  const rows = canonicalRows(fromCSV(text), headers);
  if (rows.length === 0) throw new HttpError(400, `No rows found in ${label}`);
  const missing = required.filter((h) => !(h in rows[0]));
  if (missing.length > 0) throw new HttpError(400, `${label} is missing required column(s): ${missing.join(", ")}`);
  return rows;
}

// Body: { csvText (Products), recipesCsvText (Recipes), dryRun }. Either table may be
// left out, but not both. dryRun: check every row and report what would happen, without
// saving anything.
productsRouter.post("/bulk-import", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const rows = parseImportTable(req.body?.csvText, "Products", IMPORT_HEADERS, ["name", "category", "price"]);
    const recipeRows = parseImportTable(req.body?.recipesCsvText, "Recipes", RECIPE_HEADERS, RECIPE_HEADERS);
    if (rows.length === 0 && recipeRows.length === 0) throw new HttpError(400, "Add products, recipes, or both to import");
    res.json(await bulkImportProducts(rows, { dryRun: req.body?.dryRun === true, recipeRows }));
  } catch (err) {
    next(err);
  }
});

// Turns an uploaded Excel workbook's Products and Recipes sheets into the CSV texts the
// import page previews and imports, so .xlsx files go through exactly the same checks as
// CSV. Nothing is saved.
productsRouter.post("/import-xlsx", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const fileBase64 = req.body?.fileBase64;
    if (typeof fileBase64 !== "string" || !fileBase64.trim()) throw new HttpError(400, "fileBase64 is required");
    res.json(await xlsxToImportCsv(Buffer.from(fileBase64, "base64")));
  } catch (err) {
    next(err);
  }
});

productsRouter.post("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const body = createProductSchema.parse(req.body);
    const product = await createProduct(body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

productsRouter.put("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const id = parseProductId(req.params.id);
    const body = updateProductSchema.parse(req.body);
    const product = await updateProduct(id, body);
    res.json(product);
  } catch (err) {
    next(err);
  }
});

productsRouter.delete("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    await deleteProduct(parseProductId(req.params.id));
    res.status(204).send();
  } catch (err) {
    // Prisma reports a missing record as P2025 (defect D-04: this used to reach the 500 handler).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return next(new HttpError(404, "Product not found"));
    }
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
