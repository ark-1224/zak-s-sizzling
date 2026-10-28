import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { seedRawMaterials } from "./seed-raw-materials";

const prisma = new PrismaClient();

// Zak's real menu, from the menu poster the owner sent (28 October 2026): twelve sizzling
// plates, each served with rice, with unli rice, gravy and soup. The poster has no
// ingredients, allergens or nutrition, so those are left empty for the Administrator to
// fill in (USDA lookup or "Calculate from recipe" in the product form).
const CATEGORIES = [{ name: "Sizzling Plates", icon: "🔥", sortOrder: 1, isNew: false }];

const DESCRIPTION = "Served on a sizzling plate with rice. Unli rice, unli gravy and unli soup.";

// prepMinutes: minutes the kitchen needs for one serving (estimated preparation time,
// orders/prepTime.ts); estimates until the owner gives real times. photo: a WebP in
// prisma/seed-images, cut from the menu poster.
const PRODUCTS = [
  { name: "Pork Sisig", price: 185, icon: "🍳", prepMinutes: 12, photo: "pork-sisig" },
  { name: "Pork Liempo", price: 160, icon: "🥓", prepMinutes: 15, photo: "pork-liempo" },
  { name: "Pork Chop", price: 135, icon: "🍖", prepMinutes: 15, photo: "pork-chop" },
  { name: "Pork Ribs", price: 185, icon: "🍖", prepMinutes: 15, photo: "pork-ribs" },
  { name: "Hungarian", price: 145, icon: "🌭", prepMinutes: 10, photo: "hungarian" },
  { name: "Chicken Pecho", price: 165, icon: "🍗", prepMinutes: 15, photo: "chicken-pecho" },
  { name: "Fried Chicken", price: 145, icon: "🍗", prepMinutes: 15, photo: "fried-chicken" },
  { name: "Chicken Teriyaki", price: 145, icon: "🍗", prepMinutes: 12, photo: "chicken-teriyaki" },
  { name: "Chicken BBQ", price: 145, icon: "🍗", prepMinutes: 15, photo: "chicken-bbq" },
  { name: "Chicken Fillet", price: 165, icon: "🍗", prepMinutes: 12, photo: "chicken-fillet" },
  { name: "Bangus (Boneless)", price: 135, icon: "🐟", prepMinutes: 12, photo: "bangus-boneless" },
  { name: "Calamares", price: 165, icon: "🦑", prepMinutes: 10, photo: "calamares" },
].map((p) => ({ ...p, category: "Sizzling Plates" }));

async function main() {
  console.log("Seeding roles...");
  const roles = await Promise.all(
    (["admin", "staff", "customer"] as const).map((name) =>
      prisma.role.upsert({ where: { name }, update: {}, create: { name } })
    )
  );
  const adminRole = roles.find((r) => r.name === "admin")!;

  console.log("Seeding admin user...");
  const adminEmail = "admin@zakssizzlinghub.ph";
  const adminPassword = "ChangeMe123!"; // dev-only default, rotate before any real deployment
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Zak's Sizzling Hub Admin",
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      roleId: adminRole.id,
    },
  });

  console.log("Seeding categories...");
  const categoryByName = new Map<string, number>();
  for (const cat of CATEGORIES) {
    const created = await prisma.category.upsert({
      where: { name: cat.name },
      update: { icon: cat.icon, sortOrder: cat.sortOrder, isNew: cat.isNew },
      create: cat,
    });
    categoryByName.set(cat.name, created.id);
  }

  console.log("Seeding products, inventory and photos...");
  for (const p of PRODUCTS) {
    const data = {
      price: p.price,
      categoryId: categoryByName.get(p.category)!,
      description: DESCRIPTION,
      icon: p.icon,
      isAvailable: true,
      prepMinutes: p.prepMinutes,
    };
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data: { name: p.name, ...data } });

    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: { stockQty: 25 },
      create: { productId: product.id, stockQty: 25, minStockThreshold: 5 },
    });

    const photo = readFileSync(path.join(__dirname, "seed-images", `${p.photo}.webp`));
    await prisma.productImage.upsert({
      where: { productId: product.id },
      update: { data: photo, contentType: "image/webp" },
      create: { productId: product.id, data: photo, contentType: "image/webp" },
    });
  }

  // Sample raw materials and recipes, so recipe-tracked dishes work on a fresh database.
  console.log("Seeding raw materials and recipes...");
  await seedRawMaterials(prisma);

  console.log(`Seed complete. Admin login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
