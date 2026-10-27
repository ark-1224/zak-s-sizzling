import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { getIO } from "../../websocket";
import type { Category } from "@zaks/shared-types";
import type { createCategorySchema, updateCategorySchema } from "./schema";

const NOT_FOUND = "Category not found";

type CategoryRow = Prisma.CategoryGetPayload<{ include: { _count: { select: { products: true } } } }>;

function toCategoryDTO(c: CategoryRow): Category {
  return { id: c.id, name: c.name, icon: c.icon, sortOrder: c.sortOrder, isNew: c.isNew, productCount: c._count.products };
}

/** Open kiosks reload their category rail. */
function emitCategoriesChanged() {
  getIO()?.emit("categories:changed");
}

/** Route ids are integers; anything else can't match a category, so it's a 404. */
export function parseCategoryId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) throw new HttpError(404, NOT_FOUND);
  return id;
}

export async function listCategories(): Promise<Category[]> {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return rows.map(toCategoryDTO);
}

/** Names are unique regardless of capitals ("Drinks" and "drinks" would confuse the kiosk). */
async function assertNameFree(name: string, exceptId?: number) {
  const clash = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (clash) throw new HttpError(409, `There is already a category called "${clash.name}"`);
}

/** A new category goes to the end of the kiosk's rail. */
export async function createCategory(input: z.infer<typeof createCategorySchema>): Promise<Category> {
  await assertNameFree(input.name);
  const last = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.category.create({
    data: { name: input.name, icon: input.icon || null, isNew: input.isNew ?? false, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    include: { _count: { select: { products: true } } },
  });
  emitCategoriesChanged();
  return toCategoryDTO(row);
}

export async function updateCategory(id: number, input: z.infer<typeof updateCategorySchema>): Promise<Category> {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, NOT_FOUND);
  if (input.name !== undefined) await assertNameFree(input.name, id);
  const row = await prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.icon !== undefined ? { icon: input.icon || null } : {}),
      ...(input.isNew !== undefined ? { isNew: input.isNew } : {}),
    },
    include: { _count: { select: { products: true } } },
  });
  emitCategoriesChanged();
  return toCategoryDTO(row);
}

/**
 * Only an empty category can be deleted, so no product is ever left without one (the
 * same idea as products with order history, which can't be deleted).
 */
export async function deleteCategory(id: number): Promise<void> {
  const existing = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!existing) throw new HttpError(404, NOT_FOUND);
  const count = existing._count.products;
  if (count > 0) {
    throw new HttpError(409, `Move its ${count} product${count !== 1 ? "s" : ""} to another category first, then delete "${existing.name}"`);
  }
  await prisma.category.delete({ where: { id } });
  emitCategoriesChanged();
}

/** Saves the kiosk rail's order. The list must name every category exactly once. */
export async function reorderCategories(ids: number[]): Promise<Category[]> {
  const all = await prisma.category.findMany({ select: { id: true } });
  const known = new Set(all.map((c) => c.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    throw new HttpError(400, "The new order must list every category exactly once");
  }
  await prisma.$transaction(ids.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index + 1 } })));
  emitCategoriesChanged();
  return listCategories();
}
