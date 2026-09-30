import { prisma } from "../../lib/prisma";
import type { Product, UserRole } from "@zaks/shared-types";
import { Prisma, type StockTracking } from "@prisma/client";
import { applyStockChange } from "../inventory/service";
import { refreshAvailability, servingsAvailable } from "../inventory/fulfillment";
import { HttpError } from "../../middleware/errorHandler";

/** Everything toProductDTO needs; recipe products work out their stock from the recipe. */
export const PRODUCT_DTO_INCLUDE = {
  category: true,
  inventory: true,
  recipeItems: { include: { rawMaterial: true }, orderBy: { rawMaterial: { name: "asc" } } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_DTO_INCLUDE }>;

export function toProductDTO(p: ProductWithRelations): Product {
  const isRecipe = p.tracking === "recipe";
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
    tracking: p.tracking,
    // Same number the kiosk's live inventory:updated event carries (fulfillment.ts).
    stockQty: isRecipe
      ? servingsAvailable(p.recipeItems.map((r) => ({ qtyPerServing: r.qtyPerServing, stockQty: r.rawMaterial.stockQty })))
      : p.inventory?.stockQty,
    minStockThreshold: p.inventory?.minStockThreshold,
    recipe: isRecipe
      ? p.recipeItems.map((r) => ({
          rawMaterialId: r.rawMaterialId,
          rawMaterialName: r.rawMaterial.name,
          unit: r.rawMaterial.unit,
          qtyPerServing: Number(r.qtyPerServing),
        }))
      : undefined,
  };
}

/** Cost (margins, inventory value) and recipes are admin information. Everyone else
 *  (kiosk customers, anonymous visitors, staff) gets the product without them. */
export function withAdminFieldsForRole<T extends Product | Product[]>(products: T, role: UserRole | undefined): T {
  if (role === "admin") return products;
  const strip = ({ cost: _cost, recipe: _recipe, ...rest }: Product): Product => rest;
  return (Array.isArray(products) ? products.map(strip) : strip(products)) as T;
}

export async function listProducts(): Promise<Product[]> {
  const products = await prisma.product.findMany({
    include: PRODUCT_DTO_INCLUDE,
    orderBy: { name: "asc" },
  });
  return products.map(toProductDTO);
}

export async function getProductById(id: string): Promise<Product | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: PRODUCT_DTO_INCLUDE,
  });
  return product ? toProductDTO(product) : null;
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const product = await prisma.product.findUnique({
    where: { barcode },
    include: PRODUCT_DTO_INCLUDE,
  });
  return product ? toProductDTO(product) : null;
}

export interface RecipeInput {
  rawMaterialId: string;
  qtyPerServing: number;
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
  tracking?: StockTracking;
  recipe?: RecipeInput[];
}

/** Checks a recipe against the tracking mode it will be saved with. */
async function assertValidRecipe(tracking: StockTracking, recipe: RecipeInput[] | undefined, isNewOrSwitching: boolean) {
  if (tracking === "unit") {
    if (recipe && recipe.length > 0) throw new HttpError(400, "Only products that use a recipe can have one");
    return;
  }
  if (recipe === undefined) {
    if (isNewOrSwitching) throw new HttpError(400, "A product that uses a recipe needs at least one raw material");
    return;
  }
  if (recipe.length === 0) throw new HttpError(400, "A product that uses a recipe needs at least one raw material");
  const ids = recipe.map((r) => r.rawMaterialId);
  const found = await prisma.rawMaterial.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new HttpError(404, "One of the raw materials in the recipe doesn't exist");
}

const recipeRows = (recipe: RecipeInput[]) => recipe.map((r) => ({ rawMaterialId: r.rawMaterialId, qtyPerServing: r.qtyPerServing }));

async function getProductDTO(id: string): Promise<Product> {
  return toProductDTO(await prisma.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_DTO_INCLUDE }));
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const tracking = input.tracking ?? "unit";
  await assertValidRecipe(tracking, input.recipe, true);
  const product = await prisma.product.create({
    data: {
      name: input.name,
      price: input.price,
      cost: input.cost,
      barcode: input.barcode || null,
      categoryId: input.categoryId,
      description: input.description,
      icon: input.icon,
      tracking,
      // Recipe products keep an inventory row for consistency, but their stock comes
      // from the raw materials, so their own count stays 0.
      inventory: { create: { stockQty: tracking === "recipe" ? 0 : input.stockQty, minStockThreshold: input.minStockThreshold } },
      recipeItems: tracking === "recipe" ? { create: recipeRows(input.recipe!) } : undefined,
    },
  });
  if (tracking === "recipe") await refreshAvailability({ productIds: [product.id], materialIds: [] });
  return getProductDTO(product.id);
}

export async function updateProduct(id: string, input: Partial<ProductInput> & { isAvailable?: boolean }): Promise<Product> {
  const current = await prisma.product.findUnique({ where: { id }, select: { tracking: true } });
  if (!current) throw new HttpError(404, "Product not found");
  const tracking = input.tracking ?? current.tracking;
  const switching = tracking !== current.tracking;
  await assertValidRecipe(tracking, input.recipe, switching);
  const stockTrackingChanged = switching || input.recipe !== undefined;

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
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
        tracking,
      },
    });
    // Switching to unit tracking drops the recipe; saving a recipe replaces the old one.
    if (tracking === "unit" && switching) await tx.recipeItem.deleteMany({ where: { productId: id } });
    if (tracking === "recipe" && input.recipe) {
      await tx.recipeItem.deleteMany({ where: { productId: id } });
      await tx.recipeItem.createMany({ data: recipeRows(input.recipe).map((r) => ({ ...r, productId: id })) });
    }
  });

  // Stock changes made through the product-edit form still go through the same path
  // everything else does (applyStockChange) — that's what keeps isAvailable and the
  // inventory:updated broadcast consistent. Editing here directly (the previous
  // behavior) let a product end up showing isAvailable:true with 0 stock, still
  // orderable on the kiosk, with no real-time update and no audit trail entry.
  // This form doesn't collect a reason, so — deliberately, unlike the dedicated
  // Adjust Stock modal — it doesn't write to the stock_adjustments log; that log is
  // reserved for adjustments made through that explicit flow. Recipe products have
  // no count of their own to set.
  if (tracking === "unit" && (input.stockQty !== undefined || input.minStockThreshold !== undefined)) {
    await applyStockChange(id, { setQty: input.stockQty, minStockThreshold: input.minStockThreshold });
  } else if (stockTrackingChanged) {
    await refreshAvailability({ productIds: [id], materialIds: [] });
  }

  return getProductDTO(id);
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.product.delete({ where: { id } });
}
