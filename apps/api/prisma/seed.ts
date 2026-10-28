import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { seedRawMaterials } from "./seed-raw-materials";

const prisma = new PrismaClient();

// Zak's real menu, from the menu poster the owner sent (28 October 2026): twelve sizzling
// plates, each served with java rice and gravy, with unli rice, gravy and soup.
//
// The poster lists only names and prices. Descriptions, ingredients and allergens follow
// the usual Filipino recipe for each dish, and nutrition is estimated per plate (the dish,
// one serving of java rice and the gravy) from USDA FoodData Central values; portions and
// sources are in docs/design/menu-nutrition.md. All of it is to be confirmed with the
// owner. Allergens are listed generously: every plate's gravy has flour, butter and soy
// sauce, and the rice is fried in margarine.
const CATEGORIES = [{ name: "Sizzling Plates", icon: "🔥", sortOrder: 1, isNew: false }];

const UNLI = " Unli rice, unli gravy and unli soup.";
const BASE_INGREDIENTS = ["Java rice", "Margarine", "Brown gravy"];
const BASE_ALLERGENS = ["Gluten", "Milk", "Soy"];
// The product form's checklist, in its order (products/schema.ts ALLERGENS).
const ALLERGEN_ORDER = ["Milk", "Egg", "Fish", "Shellfish", "Peanuts", "Tree nuts", "Gluten", "Soy", "Sesame"];

// prepMinutes: minutes the kitchen needs for one serving (estimated preparation time,
// orders/prepTime.ts); estimates until the owner gives real times. photo: a WebP in
// prisma/seed-images, cut from the menu poster.
const PRODUCTS = [
  {
    name: "Pork Sisig",
    price: 185,
    icon: "🍳",
    prepMinutes: 12,
    photo: "pork-sisig",
    description: "Chopped grilled pork with onions, chili and calamansi, topped with an egg and served sizzling.",
    ingredients: ["Pork", "Onion", "Chili", "Calamansi", "Soy sauce", "Mayonnaise", "Egg"],
    allergens: ["Egg"],
    nutrition: { calories: 919, protein: 44.8, carbs: 48.5, sugar: 0.4 },
  },
  {
    name: "Pork Liempo",
    price: 160,
    icon: "🥓",
    prepMinutes: 15,
    photo: "pork-liempo",
    description: "Marinated pork belly, grilled until the edges crisp, served sizzling with gravy.",
    ingredients: ["Pork belly", "Soy sauce", "Calamansi", "Garlic", "Black pepper"],
    allergens: [],
    nutrition: { calories: 882, protein: 46.5, carbs: 48, sugar: 0.2 },
  },
  {
    name: "Pork Chop",
    price: 135,
    icon: "🍖",
    prepMinutes: 15,
    photo: "pork-chop",
    description: "Seasoned pork chop, pan-fried and served sizzling with gravy.",
    ingredients: ["Pork chop", "Garlic", "Soy sauce", "Black pepper"],
    allergens: [],
    nutrition: { calories: 660, protein: 44.1, carbs: 48, sugar: 0.2 },
  },
  {
    name: "Pork Ribs",
    price: 185,
    icon: "🍖",
    prepMinutes: 15,
    photo: "pork-ribs",
    description: "Pork ribs braised until tender, glazed in a sweet barbecue sauce and served sizzling.",
    ingredients: ["Pork ribs", "Barbecue sauce", "Soy sauce", "Garlic", "Brown sugar"],
    allergens: [],
    nutrition: { calories: 923, protein: 50.5, carbs: 60.3, sugar: 10.2 },
  },
  {
    name: "Hungarian",
    price: 145,
    icon: "🌭",
    prepMinutes: 10,
    photo: "hungarian",
    description: "Two smoked Hungarian sausages, grilled and served sizzling.",
    ingredients: ["Hungarian sausage (pork and beef)", "Soy protein", "Milk solids", "Spices"],
    allergens: [],
    nutrition: { calories: 745, protein: 26.5, carbs: 50.9, sugar: 0.2 },
  },
  {
    name: "Chicken Pecho",
    price: 165,
    icon: "🍗",
    prepMinutes: 15,
    photo: "chicken-pecho",
    description: "Chicken breast marinated in calamansi, garlic and lemongrass, grilled and basted with annatto oil.",
    ingredients: ["Chicken breast", "Calamansi", "Vinegar", "Garlic", "Lemongrass", "Ginger", "Annatto oil"],
    allergens: [],
    nutrition: { calories: 660, protein: 59.2, carbs: 48, sugar: 0.2 },
  },
  {
    name: "Fried Chicken",
    price: 145,
    icon: "🍗",
    prepMinutes: 15,
    photo: "fried-chicken",
    description: "Chicken pieces in a crisp seasoned coating, fried golden and served sizzling with gravy.",
    ingredients: ["Chicken", "Flour", "Egg", "Cornstarch", "Garlic", "Black pepper"],
    allergens: ["Egg"],
    nutrition: { calories: 744, protein: 40.8, carbs: 58.8, sugar: 0.4 },
  },
  {
    name: "Chicken Teriyaki",
    price: 145,
    icon: "🍗",
    prepMinutes: 12,
    photo: "chicken-teriyaki",
    description: "Chicken glazed in sweet soy teriyaki sauce and topped with sesame seeds.",
    ingredients: ["Chicken", "Teriyaki sauce", "Soy sauce", "Brown sugar", "Garlic", "Ginger", "Sesame seeds"],
    allergens: ["Sesame"],
    nutrition: { calories: 538, protein: 46.3, carbs: 53.6, sugar: 5.3 },
  },
  {
    name: "Chicken BBQ",
    price: 145,
    icon: "🍗",
    prepMinutes: 15,
    photo: "chicken-bbq",
    description: "Chicken in a sweet Filipino barbecue marinade, grilled and basted until charred.",
    ingredients: ["Chicken", "Soy sauce", "Banana ketchup", "Calamansi", "Garlic", "Brown sugar", "Lemon-lime soda"],
    allergens: [],
    nutrition: { calories: 610, protein: 44.6, carbs: 72.4, sugar: 20.2 },
  },
  {
    name: "Chicken Fillet",
    price: 165,
    icon: "🍗",
    prepMinutes: 12,
    photo: "chicken-fillet",
    description: "Boneless chicken fillet in a crisp breading, fried golden and served sizzling with gravy.",
    ingredients: ["Boneless chicken", "Flour", "Egg", "Breadcrumbs", "Garlic", "Black pepper"],
    allergens: ["Egg"],
    nutrition: { calories: 622, protein: 36.7, carbs: 57, sugar: 0.3 },
  },
  {
    name: "Bangus (Boneless)",
    price: 135,
    icon: "🐟",
    prepMinutes: 12,
    photo: "bangus-boneless",
    description: "Boneless milkfish marinated in vinegar and garlic, then fried until crisp.",
    ingredients: ["Milkfish (bangus)", "Vinegar", "Garlic", "Black pepper", "Cooking oil"],
    allergens: ["Fish"],
    nutrition: { calories: 605, protein: 46, carbs: 48, sugar: 0.2 },
  },
  {
    name: "Calamares",
    price: 165,
    icon: "🦑",
    prepMinutes: 10,
    photo: "calamares",
    description: "Squid rings in a light, crisp batter, fried golden and served sizzling.",
    ingredients: ["Squid", "Flour", "Cornstarch", "Egg", "Garlic powder", "Black pepper"],
    allergens: ["Shellfish", "Egg"],
    nutrition: { calories: 627, protein: 27.3, carbs: 69.2, sugar: 0.5 },
  },
].map((p) => ({
  ...p,
  category: "Sizzling Plates",
  description: p.description + UNLI,
  ingredients: [...p.ingredients, ...BASE_INGREDIENTS],
  allergens: ALLERGEN_ORDER.filter((a) => p.allergens.includes(a) || BASE_ALLERGENS.includes(a)),
}));

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
      description: p.description,
      icon: p.icon,
      ingredients: p.ingredients,
      allergens: p.allergens,
      calories: p.nutrition.calories,
      proteinG: p.nutrition.protein,
      carbsG: p.nutrition.carbs,
      sugarG: p.nutrition.sugar,
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
