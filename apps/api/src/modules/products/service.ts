import { prisma } from "../../lib/prisma";
import type { Product } from "@zaks/shared-types";
import { Prisma } from "@prisma/client";

type ProductWithRelations = Prisma.ProductGetPayload<{ include: { category: true; inventory: true } }>;

export function toProductDTO(p: ProductWithRelations): Product {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    cost: p.cost ? Number(p.cost) : null,
    barcode: p.barcode,
    categoryId: p.categoryId,
    category: {
      id: p.category.id,
      name: p.category.name,
      icon: p.category.icon,
      sortOrder: p.category.sortOrder,
      isNew: p.category.isNew,
    },
    description: p.description,
    icon: p.icon,
    ingredients: p.ingredients,
    allergens: p.allergens,
    nutrition: {
      calories: p.calories,
      protein: p.proteinG ? Number(p.proteinG) : null,
      carbs: p.carbsG ? Number(p.carbsG) : null,
      sugar: p.sugarG ? Number(p.sugarG) : null,
    },
    isAvailable: p.isAvailable,
    stockQty: p.inventory?.stockQty,
    minStockThreshold: p.inventory?.minStockThreshold,
  };
}

export async function listProducts(): Promise<Product[]> {
  const products = await prisma.product.findMany({
    include: { category: true, inventory: true },
    orderBy: { name: "asc" },
  });
  return products.map(toProductDTO);
}

export async function getProductById(id: string): Promise<Product | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, inventory: true },
  });
  return product ? toProductDTO(product) : null;
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const product = await prisma.product.findUnique({
    where: { barcode },
    include: { category: true, inventory: true },
  });
  return product ? toProductDTO(product) : null;
}

export interface ProductInput {
  name: string;
  price: number;
  cost?: number;
  barcode?: string;
  categoryId: number;
  description?: string;
  icon?: string;
  stockQty: number;
  minStockThreshold: number;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const product = await prisma.product.create({
    data: {
      name: input.name,
      price: input.price,
      cost: input.cost,
      barcode: input.barcode || null,
      categoryId: input.categoryId,
      description: input.description,
      icon: input.icon,
      inventory: { create: { stockQty: input.stockQty, minStockThreshold: input.minStockThreshold } },
    },
    include: { category: true, inventory: true },
  });
  return toProductDTO(product);
}

export async function updateProduct(id: string, input: Partial<ProductInput> & { isAvailable?: boolean }): Promise<Product> {
  const product = await prisma.product.update({
    where: { id },
    data: {
      name: input.name,
      price: input.price,
      cost: input.cost,
      barcode: input.barcode === undefined ? undefined : input.barcode || null,
      categoryId: input.categoryId,
      description: input.description,
      icon: input.icon,
      isAvailable: input.isAvailable,
      inventory:
        input.stockQty !== undefined || input.minStockThreshold !== undefined
          ? {
              upsert: {
                update: { stockQty: input.stockQty, minStockThreshold: input.minStockThreshold },
                create: { stockQty: input.stockQty ?? 0, minStockThreshold: input.minStockThreshold ?? 5 },
              },
            }
          : undefined,
    },
    include: { category: true, inventory: true },
  });
  return toProductDTO(product);
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.product.delete({ where: { id } });
}
