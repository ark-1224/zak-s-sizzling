import { PrismaClient, type MaterialUnit } from "@prisma/client";

// Sample raw materials and recipes for development and demos, until Zak's real recipe
// quantities are available (docs/design/raw-material-stock.md, section 6). Safe to run
// more than once: materials are upserted by name, and each listed product's recipe is
// replaced. It switches only the listed products to recipe tracking; everything else
// keeps unit tracking. Existing raw-material stock levels are left as they are.
//
// Run: npm run db:seed:raw-materials -w apps/api

const prisma = new PrismaClient();

const MATERIALS: { name: string; unit: MaterialUnit; stockQty: number; minStockThreshold: number; costPerUnit: number }[] = [
  { name: "Pork (sisig cut)", unit: "g", stockQty: 5000, minStockThreshold: 1000, costPerUnit: 0.32 },
  { name: "Beef sirloin", unit: "g", stockQty: 4000, minStockThreshold: 800, costPerUnit: 0.55 },
  { name: "Onion", unit: "g", stockQty: 3000, minStockThreshold: 500, costPerUnit: 0.12 },
  { name: "Garlic", unit: "g", stockQty: 1000, minStockThreshold: 200, costPerUnit: 0.18 },
  { name: "Egg", unit: "pc", stockQty: 60, minStockThreshold: 12, costPerUnit: 9 },
  { name: "Rice (uncooked)", unit: "g", stockQty: 10000, minStockThreshold: 2000, costPerUnit: 0.05 },
  { name: "Soy sauce", unit: "ml", stockQty: 2000, minStockThreshold: 300, costPerUnit: 0.08 },
  { name: "Cooking oil", unit: "ml", stockQty: 3000, minStockThreshold: 500, costPerUnit: 0.09 },
];

const RECIPES: Record<string, [material: string, qtyPerServing: number][]> = {
  "Sizzling Sisig": [["Pork (sisig cut)", 150], ["Onion", 30], ["Egg", 1], ["Soy sauce", 10], ["Cooking oil", 10]],
  "Sizzling Beef Bulgogi": [["Beef sirloin", 150], ["Onion", 30], ["Garlic", 5], ["Soy sauce", 20], ["Cooking oil", 10]],
  "Garlic Fried Rice": [["Rice (uncooked)", 100], ["Garlic", 10], ["Cooking oil", 10]],
  "Plain Rice": [["Rice (uncooked)", 100]],
};

async function main() {
  const idByName = new Map<string, string>();
  for (const m of MATERIALS) {
    const row = await prisma.rawMaterial.upsert({
      where: { name: m.name },
      update: { unit: m.unit, minStockThreshold: m.minStockThreshold, costPerUnit: m.costPerUnit },
      create: m,
    });
    idByName.set(m.name, row.id);
  }

  for (const [productName, lines] of Object.entries(RECIPES)) {
    const product = await prisma.product.findFirst({ where: { name: productName } });
    if (!product) {
      console.warn(`Skipped "${productName}": no product with that name`);
      continue;
    }
    await prisma.$transaction([
      prisma.recipeItem.deleteMany({ where: { productId: product.id } }),
      prisma.recipeItem.createMany({
        data: lines.map(([material, qtyPerServing]) => ({ productId: product.id, rawMaterialId: idByName.get(material)!, qtyPerServing })),
      }),
      prisma.product.update({ where: { id: product.id }, data: { tracking: "recipe", isAvailable: true } }),
    ]);
    console.log(`Recipe set for ${productName} (${lines.length} raw materials)`);
  }
  console.log(`${MATERIALS.length} raw materials ready`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
