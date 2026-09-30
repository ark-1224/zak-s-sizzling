import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { adjustRawMaterialSchema, createRawMaterialSchema, rawMaterialIdSchema, updateRawMaterialSchema } from "./schema";
import {
  adjustRawMaterialStock,
  createRawMaterial,
  listRawMaterialMovements,
  listRawMaterials,
  updateRawMaterial,
  withCostForRole,
} from "./service";

// Staff restock and adjust raw materials, like product stock; adding or renaming them
// is product management, which is Administrator-only.
export const rawMaterialsRouter = Router();

/** A malformed id is simply a raw material that doesn't exist (not a server error). */
function parseId(id: string): string {
  if (!rawMaterialIdSchema.safeParse(id).success) throw new HttpError(404, "Raw material not found");
  return id;
}

rawMaterialsRouter.get("/", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(withCostForRole(await listRawMaterials(), req.user?.role));
  } catch (err) {
    next(err);
  }
});

rawMaterialsRouter.get("/movements", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const rawMaterialId = typeof req.query.rawMaterialId === "string" ? parseId(req.query.rawMaterialId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) || undefined : undefined;
    res.json(await listRawMaterialMovements({ rawMaterialId, limit }));
  } catch (err) {
    next(err);
  }
});

rawMaterialsRouter.post("/", authenticate, authorize("admin"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = createRawMaterialSchema.parse(req.body);
    res.status(201).json(await createRawMaterial(body, req.user!.id));
  } catch (err) {
    next(err);
  }
});

rawMaterialsRouter.put("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const body = updateRawMaterialSchema.parse(req.body);
    res.json(await updateRawMaterial(parseId(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

rawMaterialsRouter.patch("/:id/stock", authenticate, authorize("admin", "staff"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const body = adjustRawMaterialSchema.parse(req.body);
    const material = await adjustRawMaterialStock(id, body, req.user!.id);
    res.json(withCostForRole(material, req.user?.role));
  } catch (err) {
    next(err);
  }
});
