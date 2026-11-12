import { prisma } from "../../lib/prisma";
import type { Nutrition, Product, UserRole } from "@zaks/shared-types";
import { Prisma } from "@prisma/client";
import { refreshAvailability, servingsAvailable } from "../inventory/fulfillment";
import { applyStockChange } from "../inventory/service";
import { HttpError } from "../../middleware/errorHandler";
import { productImageUrl } from "./image";

/** Everything toProductDTO needs; recipe products work out their stock from the recipe. */
export const PRODUCT_DTO_INCLUDE = {
  category: true,
  inventory: true,
  recipeItems: { include: { rawMaterial: true }, orderBy: { rawMaterial: { name: "asc" } } },
  // Only whether there's a photo and its version, never the bytes (products/image.ts).
  image: { select: { updatedAt: true } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_DTO_INCLUDE }>;

export function toProductDTO(p: ProductWithRelations): Product {
  const isRecipe = p.tracking === "recipe";
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    cost: p.cost ? Number(p.cost) : null,
    categoryId: p.categoryId,
    category: {
      id: p.category.id,
      name: p.category.name,
      icon: p.category.icon,
      sortOrder: p.category.sortOrder,
      isNew: p.category.isNew,
      isReadyMade: p.category.isReadyMade,
    },
    description: p.description,
    icon: p.icon,
    imageUrl: p.image ? productImageUrl(p.id, p.image.updatedAt) : null,
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
    prepMinutes: p.prepMinutes,
    instructionOptions: p.instructionOptions,
    allowInstructions: p.allowInstructions,
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

export interface RecipeInput {
  rawMaterialId: string;
  qtyPerServing: number;
}

export interface ProductInput {
  name: string;
  price: number;
  cost?: number;
  categoryId: number;
  description?: string;
  icon?: string;
  /** A dish's bill of materials; required for a dish, refused for a ready-made item. */
  recipe?: RecipeInput[];
  /** Ready-made items only: pieces on hand and the minimum before it needs restocking. */
  stockQty?: number;
  minStockThreshold?: number;
  prepMinutes?: number;
  instructionOptions?: string[];
  allowInstructions?: boolean;
  ingredients?: string[];
  allergens?: string[];
  nutrition?: Nutrition;
}

const NEEDS_RECIPE = "A dish needs at least one raw material in its recipe";
export const READY_MADE_NO_RECIPE = "Ready-made items are counted in pieces, so they don't take a recipe";

/** Whether the category is the built-in Ready-made one (items counted in pieces, no recipe). */
async function isReadyMadeCategory(categoryId: number): Promise<boolean> {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { isReadyMade: true } });
  if (!category) throw new HttpError(400, "That category doesn't exist");
  return category.isReadyMade;
}

/**
 * Every dish is made from a bill of materials (panel feedback), so a recipe is required.
 * `required` is false only for an edit that leaves an existing recipe as it is.
 */
async function assertValidRecipe(recipe: RecipeInput[] | undefined, required: boolean) {
  if (recipe === undefined) {
    if (required) throw new HttpError(400, NEEDS_RECIPE);
    return;
  }
  if (recipe.length === 0) throw new HttpError(400, NEEDS_RECIPE);
  const ids = recipe.map((r) => r.rawMaterialId);
  const found = await prisma.rawMaterial.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new HttpError(404, "One of the raw materials in the recipe doesn't exist");
}

/** Ingredients, allergens, nutrition and special-instruction options, when the form sends them. */
function detailColumns(input: Partial<ProductInput>) {
  return {
    ingredients: input.ingredients,
    allergens: input.allergens,
    instructionOptions: input.instructionOptions,
    allowInstructions: input.allowInstructions,
    ...(input.nutrition
      ? {
          calories: input.nutrition.calories,
          proteinG: input.nutrition.protein,
          carbsG: input.nutrition.carbs,
          sugarG: input.nutrition.sugar,
        }
      : {}),
  };
}

const recipeRows = (recipe: RecipeInput[]) => recipe.map((r) => ({ rawMaterialId: r.rawMaterialId, qtyPerServing: r.qtyPerServing }));

/**
 * A raw material that a dish's recipe uses is in use: one marked "not in use" (for
 * example a costed ingredient no dish used yet) is put back in use, so it shows on the
 * Raw materials page's restock lists and in the low-stock alerts again.
 */
async function putRecipeMaterialsInUse(db: Prisma.TransactionClient, recipe: RecipeInput[]) {
  await db.rawMaterial.updateMany({ where: { id: { in: recipe.map((r) => r.rawMaterialId) }, isActive: false }, data: { isActive: true } });
}

async function getProductDTO(id: string): Promise<Product> {
  return toProductDTO(await prisma.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_DTO_INCLUDE }));
}

export async function createProduct(input: ProductInput): Promise<Product> {
  if (await isReadyMadeCategory(input.categoryId)) return createReadyMadeItem(input);
  await assertValidRecipe(input.recipe, true);
  const recipe = input.recipe!;
  await putRecipeMaterialsInUse(prisma, recipe);
  const product = await prisma.product.create({
    data: {
      name: input.name,
      price: input.price,
      cost: input.cost,
      categoryId: input.categoryId,
      description: input.description,
      icon: input.icon,
      tracking: "recipe",
      prepMinutes: input.prepMinutes,
      ...detailColumns(input),
      // A dish's stock is the servings its raw materials can make; the inventory row is
      // kept for the stock engine's older paths and stays at 0.
      inventory: { create: { stockQty: 0, minStockThreshold: 0 } },
      recipeItems: { create: recipeRows(recipe) },
    },
  });
  await refreshAvailability({ productIds: [product.id], materialIds: [] });
  return getProductDTO(product.id);
}

/** A ready-made item (a bottled drink) has no recipe: it's counted in pieces. */
async function createReadyMadeItem(input: ProductInput): Promise<Product> {
  if (input.recipe?.length) throw new HttpError(400, READY_MADE_NO_RECIPE);
  const stockQty = input.stockQty ?? 0;
  const product = await prisma.product.create({
    data: {
      name: input.name,
      price: input.price,
      cost: input.cost,
      categoryId: input.categoryId,
      description: input.description,
      icon: input.icon,
      tracking: "unit",
      isAvailable: stockQty > 0,
      // Served as it is, so no kitchen time unless the form says otherwise.
      prepMinutes: input.prepMinutes ?? 0,
      ...detailColumns(input),
      inventory: { create: { stockQty, minStockThreshold: input.minStockThreshold ?? 0 } },
    },
  });
  await refreshAvailability({ productIds: [product.id], materialIds: [] });
  return getProductDTO(product.id);
}

export async function updateProduct(id: string, input: Partial<ProductInput> & { isAvailable?: boolean }): Promise<Product> {
  const current = await prisma.product.findUnique({
    where: { id },
    select: { categoryId: true, tracking: true, inventory: { select: { id: true } }, _count: { select: { recipeItems: true } } },
  });
  if (!current) throw new HttpError(404, "Product not found");
  const readyMade = await isReadyMadeCategory(input.categoryId ?? current.categoryId);
  const wasCountedInPieces = current.tracking === "unit";

  if (readyMade) {
    if (input.recipe?.length) throw new HttpError(400, READY_MADE_NO_RECIPE);
  } else {
    // A dish without a recipe yet (one moved out of Ready-made, or counted in units before
    // bill of materials) must get one with this save; a dish that has one may keep it.
    await assertValidRecipe(input.recipe, current._count.recipeItems === 0 || wasCountedInPieces);
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        name: input.name,
        price: input.price,
        cost: input.cost,
        categoryId: input.categoryId,
        description: input.description,
        icon: input.icon,
        isAvailable: input.isAvailable,
        tracking: readyMade ? "unit" : "recipe",
        prepMinutes: input.prepMinutes,
        ...detailColumns(input),
      },
    });
    if (readyMade) {
      // A dish moved into Ready-made is counted in pieces from now on, so its recipe goes.
      if (!wasCountedInPieces) await tx.recipeItem.deleteMany({ where: { productId: id } });
      if (!current.inventory) await tx.inventory.create({ data: { productId: id, stockQty: 0, minStockThreshold: 0 } });
    } else if (input.recipe) {
      // Saving a recipe replaces the old one.
      await tx.recipeItem.deleteMany({ where: { productId: id } });
      await tx.recipeItem.createMany({ data: recipeRows(input.recipe).map((r) => ({ ...r, productId: id })) });
      await putRecipeMaterialsInUse(tx, input.recipe);
    }
  });

  if (readyMade && (input.stockQty !== undefined || input.minStockThreshold !== undefined)) {
    // The form's piece count goes through the one place stock changes, which keeps
    // isAvailable and the kiosk's live update in step. (Adjust stock on Raw materials >
    // Ready-made is the logged way, with a reason.)
    await applyStockChange(id, { setQty: input.stockQty, minStockThreshold: input.minStockThreshold });
  } else if (input.recipe !== undefined || readyMade !== wasCountedInPieces) {
    // Servings (or pieces), and so whether the kiosk shows the item, follow from the stock.
    await refreshAvailability({ productIds: [id], materialIds: [] });
  }

  return getProductDTO(id);
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.product.delete({ where: { id } });
}
