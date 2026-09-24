import { prisma } from "../../lib/prisma";
import type { Product } from "@zaks/shared-types";
import { Prisma } from "@prisma/client";
import { applyStockChange } from "../inventory/service";

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
    },
    include: { category: true, inventory: true },
  });

  // Stock changes made through the product-edit form still go through the same path
  // everything else does (applyStockChange) — that's what keeps isAvailable and the
  // inventory:updated broadcast consistent. Editing here directly (the previous
  // behavior) let a product end up showing isAvailable:true with 0 stock, still
  // orderable on the kiosk, with no real-time update and no audit trail entry.
  // This form doesn't collect a reason, so — deliberately, unlike the dedicated
  // Adjust Stock modal — it doesn't write to the stock_adjustments log; that log is
  // reserved for adjustments made through that explicit flow.
  if (input.stockQty !== undefined || input.minStockThreshold !== undefined) {
    const { product: withStock } = await applyStockChange(id, {
      setQty: input.stockQty,
      minStockThreshold: input.minStockThreshold,
    });
    return withStock;
  }

  return toProductDTO(product);
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.product.delete({ where: { id } });
}
