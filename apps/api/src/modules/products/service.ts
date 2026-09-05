import { prisma } from "../../lib/prisma";
import type { Product } from "@zaks/shared-types";
import { Prisma } from "@prisma/client";

type ProductWithRelations = Prisma.ProductGetPayload<{ include: { category: true; inventory: true } }>;

export function toProductDTO(p: ProductWithRelations): Product {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
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
