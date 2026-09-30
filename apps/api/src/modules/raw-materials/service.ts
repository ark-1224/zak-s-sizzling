import { Prisma } from "@prisma/client";
import type { AdjustmentReason, RawMaterialDTO, RawMaterialMovementDTO, UserRole } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { refreshAvailability } from "../inventory/fulfillment";

// Raw-material stock for recipe-tracked dishes (docs/design/raw-material-stock.md 3.5
// and 3.6). Deduction for sales lives in inventory/fulfillment.ts; this module covers
// the admin screens: the list, restocks and adjustments, and the movement log.

const RAW_MATERIAL_INCLUDE = {
  recipeItems: { include: { product: { select: { id: true, name: true } } }, orderBy: { product: { name: "asc" } } },
} satisfies Prisma.RawMaterialInclude;

type RawMaterialWithRecipes = Prisma.RawMaterialGetPayload<{ include: typeof RAW_MATERIAL_INCLUDE }>;

function toRawMaterialDTO(m: RawMaterialWithRecipes): RawMaterialDTO {
  return {
    id: m.id,
    name: m.name,
    unit: m.unit,
    stockQty: Number(m.stockQty),
    minStockThreshold: Number(m.minStockThreshold),
    costPerUnit: m.costPerUnit === null ? null : Number(m.costPerUnit),
    isActive: m.isActive,
    isLow: m.stockQty.lte(m.minStockThreshold),
    usedBy: m.recipeItems.map((r) => ({ productId: r.product.id, productName: r.product.name, qtyPerServing: Number(r.qtyPerServing) })),
  };
}

/** Cost per unit is admin information, like product cost. */
export function withCostForRole<T extends RawMaterialDTO | RawMaterialDTO[]>(materials: T, role: UserRole | undefined): T {
  if (role === "admin") return materials;
  const strip = ({ costPerUnit: _cost, ...rest }: RawMaterialDTO): RawMaterialDTO => rest;
  return (Array.isArray(materials) ? materials.map(strip) : strip(materials)) as T;
}

const decimal = (n: number) => new Prisma.Decimal(n).toDecimalPlaces(3);

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function getRawMaterialDTO(id: string): Promise<RawMaterialDTO> {
  return toRawMaterialDTO(await prisma.rawMaterial.findUniqueOrThrow({ where: { id }, include: RAW_MATERIAL_INCLUDE }));
}

export async function listRawMaterials(): Promise<RawMaterialDTO[]> {
  const rows = await prisma.rawMaterial.findMany({ include: RAW_MATERIAL_INCLUDE, orderBy: { name: "asc" } });
  return rows.map(toRawMaterialDTO);
}

export interface CreateRawMaterialInput {
  name: string;
  unit: "g" | "ml" | "pc";
  stockQty: number;
  minStockThreshold: number;
  costPerUnit?: number;
}

/** Creates a raw material; any opening stock is logged as a restock. */
export async function createRawMaterial(input: CreateRawMaterialInput, createdById: string): Promise<RawMaterialDTO> {
  try {
    const material = await prisma.$transaction(async (tx) => {
      const created = await tx.rawMaterial.create({
        data: {
          name: input.name,
          unit: input.unit,
          stockQty: decimal(input.stockQty),
          minStockThreshold: decimal(input.minStockThreshold),
          costPerUnit: input.costPerUnit,
        },
      });
      if (created.stockQty.gt(0)) {
        await tx.rawMaterialMovement.create({
          data: {
            rawMaterialId: created.id,
            delta: created.stockQty,
            previousQty: 0,
            newQty: created.stockQty,
            type: "restock",
            reason: "restock",
            note: "Opening stock",
            adjustedById: createdById,
          },
        });
      }
      return created;
    });
    return getRawMaterialDTO(material.id);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "A raw material with that name already exists");
    throw err;
  }
}

export interface UpdateRawMaterialInput {
  name?: string;
  minStockThreshold?: number;
  costPerUnit?: number | null;
  isActive?: boolean;
}

export async function updateRawMaterial(id: string, input: UpdateRawMaterialInput): Promise<RawMaterialDTO> {
  const existing = await prisma.rawMaterial.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Raw material not found");
  try {
    await prisma.rawMaterial.update({
      where: { id },
      data: {
        name: input.name,
        minStockThreshold: input.minStockThreshold === undefined ? undefined : decimal(input.minStockThreshold),
        costPerUnit: input.costPerUnit,
        isActive: input.isActive,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "A raw material with that name already exists");
    throw err;
  }
  return getRawMaterialDTO(id);
}

export interface AdjustRawMaterialInput {
  setQty?: number;
  delta?: number;
  reason: AdjustmentReason;
  note?: string;
}

/**
 * Restock, count, or correct a raw material. Logged in raw_material_movements with who
 * and why, then every dish that uses it is re-checked so the kiosk's "Sold out" state
 * updates live. Stock can't go below zero (checked here and by a database rule).
 */
export async function adjustRawMaterialStock(id: string, change: AdjustRawMaterialInput, adjustedById: string): Promise<RawMaterialDTO> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.rawMaterial.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "Raw material not found");

    let newQty: Prisma.Decimal;
    if (change.setQty !== undefined) {
      newQty = decimal(change.setQty);
      await tx.rawMaterial.update({ where: { id }, data: { stockQty: newQty } });
    } else {
      const delta = decimal(change.delta!);
      // Conditional on enough stock, so two adjustments at once can't go below zero.
      const result = await tx.rawMaterial.updateMany({
        where: { id, stockQty: { gte: delta.neg() } },
        data: { stockQty: { increment: delta } },
      });
      if (result.count === 0) {
        throw new HttpError(409, `Not enough stock for this change — only ${current.stockQty.toString()} ${current.unit} left`);
      }
      newQty = (await tx.rawMaterial.findUniqueOrThrow({ where: { id } })).stockQty;
    }

    const previousQty = change.setQty !== undefined ? current.stockQty : newQty.sub(decimal(change.delta!));
    await tx.rawMaterialMovement.create({
      data: {
        rawMaterialId: id,
        delta: newQty.sub(previousQty),
        previousQty,
        newQty,
        type: change.reason === "restock" ? "restock" : "adjustment",
        reason: change.reason,
        note: change.note || null,
        adjustedById,
      },
    });
  });

  await refreshAvailability({ productIds: [], materialIds: [id] });
  return getRawMaterialDTO(id);
}

export async function listRawMaterialMovements(opts: { rawMaterialId?: string; limit?: number }): Promise<RawMaterialMovementDTO[]> {
  const rows = await prisma.rawMaterialMovement.findMany({
    where: opts.rawMaterialId ? { rawMaterialId: opts.rawMaterialId } : undefined,
    include: {
      rawMaterial: { select: { name: true, unit: true } },
      adjustedBy: { select: { name: true } },
      order: { select: { orderNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  });

  return rows.map((r) => ({
    id: r.id,
    rawMaterialId: r.rawMaterialId,
    rawMaterialName: r.rawMaterial.name,
    unit: r.rawMaterial.unit,
    delta: Number(r.delta),
    previousQty: Number(r.previousQty),
    newQty: Number(r.newQty),
    type: r.type,
    reason: r.reason,
    note: r.note,
    orderNumber: r.order?.orderNumber ?? null,
    adjustedByName: r.adjustedBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
