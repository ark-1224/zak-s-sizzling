import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Ported from kiosk.html's CATEGORIES mock array (Downloads/kiosk.html, lines 423-430)
const CATEGORIES = [
  { name: "Sizzling Plates", icon: "🔥", sortOrder: 1, isNew: false },
  { name: "Rice & Noodles", icon: "🍚", sortOrder: 2, isNew: false },
  { name: "Soups & Stews", icon: "🍲", sortOrder: 3, isNew: false },
  { name: "Sides", icon: "🥟", sortOrder: 4, isNew: false },
  { name: "Drinks", icon: "🥤", sortOrder: 5, isNew: false },
  { name: "Specials", icon: "🌶️", sortOrder: 6, isNew: true },
];

// Ported from kiosk.html's PRODUCTS mock array (Downloads/kiosk.html, lines 432-518)
const PRODUCTS = [
  {
    name: "Sizzling Sisig",
    category: "Sizzling Plates",
    price: 185,
    inStock: true,
    icon: "🍖",
    description:
      "Chopped pork face and liver, seared on a hot cast-iron plate with onions, chili, and calamansi. Topped with a raw egg to stir in tableside.",
    ingredients: ["Pork", "Onions", "Chili", "Calamansi", "Egg", "Mayonnaise"],
    allergens: ["Egg", "Soy"],
    nutrition: { calories: 420, protein: 26, carbs: 8, sugar: 2 },
  },
  {
    name: "Sizzling Beef Bulgogi",
    category: "Sizzling Plates",
    price: 220,
    inStock: true,
    icon: "🥩",
    description:
      "Thinly sliced marinated beef, seared until the edges caramelize, served bubbling on a hot plate with sesame and scallions.",
    ingredients: ["Beef sirloin", "Soy sauce", "Brown sugar", "Garlic", "Sesame oil", "Scallions"],
    allergens: ["Soy", "Sesame"],
    nutrition: { calories: 480, protein: 32, carbs: 14, sugar: 9 },
  },
  {
    name: "Sizzling Calamares",
    category: "Sizzling Plates",
    price: 195,
    inStock: false,
    icon: "🦑",
    description: "Crispy breaded squid rings, tossed in garlic butter and plated straight off the hot plate.",
    ingredients: ["Squid", "Flour", "Garlic", "Butter", "Calamansi"],
    allergens: ["Shellfish", "Gluten", "Milk"],
    nutrition: { calories: 390, protein: 22, carbs: 24, sugar: 1 },
  },
  {
    name: "Sizzling Tofu Sisig",
    category: "Sizzling Plates",
    price: 150,
    inStock: true,
    icon: "🥘",
    description: "A vegetarian take on sisig — crisped tofu with onions, chili, and calamansi on a smoking hot plate.",
    ingredients: ["Tofu", "Onions", "Chili", "Calamansi", "Soy sauce"],
    allergens: ["Soy"],
    nutrition: { calories: 280, protein: 18, carbs: 12, sugar: 2 },
  },
  {
    name: "Sizzling Pork Chop",
    category: "Sizzling Plates",
    price: 210,
    inStock: true,
    icon: "🍖",
    description: "Grilled marinated pork chop finished in garlic butter, served sizzling with a side of gravy.",
    ingredients: ["Pork chop", "Garlic", "Butter", "Soy sauce", "Black pepper"],
    allergens: ["Soy", "Milk"],
    nutrition: { calories: 460, protein: 34, carbs: 6, sugar: 3 },
  },
  {
    name: "Garlic Fried Rice",
    category: "Rice & Noodles",
    price: 45,
    inStock: true,
    icon: "🍚",
    description: "Day-old rice fried with toasted garlic until every grain is golden.",
    ingredients: ["Rice", "Garlic", "Oil", "Salt"],
    allergens: [],
    nutrition: { calories: 210, protein: 4, carbs: 38, sugar: 0 },
  },
  {
    name: "Plain Rice",
    category: "Rice & Noodles",
    price: 35,
    inStock: true,
    icon: "🍚",
    description: "Steamed jasmine rice, the classic pair for any sizzling plate.",
    ingredients: ["Rice"],
    allergens: [],
    nutrition: { calories: 190, protein: 3, carbs: 42, sugar: 0 },
  },
  {
    name: "Pancit Canton",
    category: "Rice & Noodles",
    price: 120,
    inStock: true,
    icon: "🍜",
    description: "Stir-fried egg noodles with vegetables, pork, and shrimp in a savory soy glaze.",
    ingredients: ["Egg noodles", "Pork", "Shrimp", "Cabbage", "Carrots", "Soy sauce"],
    allergens: ["Gluten", "Shellfish", "Egg", "Soy"],
    nutrition: { calories: 340, protein: 16, carbs: 44, sugar: 4 },
  },
  {
    name: "Java Rice",
    category: "Rice & Noodles",
    price: 55,
    inStock: false,
    icon: "🍛",
    description: "Turmeric-tinted fried rice with a smoky, savory depth — a Bacolod classic.",
    ingredients: ["Rice", "Turmeric", "Garlic", "Annatto oil"],
    allergens: [],
    nutrition: { calories: 230, protein: 4, carbs: 40, sugar: 1 },
  },
  {
    name: "Sinigang na Baboy",
    category: "Soups & Stews",
    price: 165,
    inStock: true,
    icon: "🍲",
    description: "Pork simmered in a sour tamarind broth with kangkong, radish, and string beans.",
    ingredients: ["Pork", "Tamarind", "Kangkong", "Radish", "String beans", "Tomato"],
    allergens: [],
    nutrition: { calories: 310, protein: 22, carbs: 16, sugar: 5 },
  },
  {
    name: "Bulalo",
    category: "Soups & Stews",
    price: 220,
    inStock: true,
    icon: "🍲",
    description: "Beef shank and marrow slow-simmered until tender in a clear, savory broth with corn and cabbage.",
    ingredients: ["Beef shank", "Bone marrow", "Corn", "Cabbage", "Peppercorn"],
    allergens: [],
    nutrition: { calories: 390, protein: 28, carbs: 14, sugar: 4 },
  },
  {
    name: "Lumpiang Shanghai (6pcs)",
    category: "Sides",
    price: 95,
    inStock: true,
    icon: "🥟",
    description: "Crispy fried spring rolls filled with seasoned ground pork, served with a sweet-and-sour dip.",
    ingredients: ["Ground pork", "Carrots", "Onions", "Spring roll wrapper"],
    allergens: ["Gluten", "Egg"],
    nutrition: { calories: 260, protein: 10, carbs: 22, sugar: 6 },
  },
  {
    name: "Atchara",
    category: "Sides",
    price: 35,
    inStock: true,
    icon: "🥗",
    description: "Pickled green papaya relish — a sharp, tangy counterpoint to rich sizzling plates.",
    ingredients: ["Green papaya", "Carrots", "Vinegar", "Sugar", "Ginger"],
    allergens: [],
    nutrition: { calories: 60, protein: 1, carbs: 14, sugar: 11 },
  },
  {
    name: "House Iced Tea",
    category: "Drinks",
    price: 45,
    inStock: true,
    icon: "🥤",
    description: "Freshly brewed black tea over ice, lightly sweetened.",
    ingredients: ["Black tea", "Cane sugar", "Ice"],
    allergens: [],
    nutrition: { calories: 90, protein: 0, carbs: 22, sugar: 20 },
  },
  {
    name: "Buko Juice",
    category: "Drinks",
    price: 55,
    inStock: false,
    icon: "🥥",
    description: "Fresh young coconut water with strips of soft coconut meat.",
    ingredients: ["Coconut water", "Coconut meat"],
    allergens: [],
    nutrition: { calories: 80, protein: 1, carbs: 18, sugar: 14 },
  },
  {
    name: "Kare-Kare",
    category: "Specials",
    price: 240,
    inStock: true,
    icon: "🍛",
    description:
      "Oxtail and vegetables in a rich peanut sauce, served with a side of shrimp paste — a limited-batch special.",
    ingredients: ["Oxtail", "Peanut sauce", "Eggplant", "String beans", "Bok choy", "Shrimp paste"],
    allergens: ["Peanuts", "Shellfish"],
    nutrition: { calories: 450, protein: 24, carbs: 20, sugar: 6 },
  },
  {
    name: "Crispy Pata (Half)",
    category: "Specials",
    price: 320,
    inStock: true,
    icon: "🍗",
    description: "Deep-fried pork leg, shatteringly crisp outside and tender within, served with a soy-vinegar dip.",
    ingredients: ["Pork leg", "Soy sauce", "Vinegar", "Garlic", "Bay leaf"],
    allergens: ["Soy"],
    nutrition: { calories: 580, protein: 38, carbs: 4, sugar: 1 },
  },
];

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

  console.log("Seeding products + inventory...");
  for (const p of PRODUCTS) {
    const categoryId = categoryByName.get(p.category)!;
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: {
            price: p.price,
            categoryId,
            description: p.description,
            icon: p.icon,
            ingredients: p.ingredients,
            allergens: p.allergens,
            calories: p.nutrition.calories,
            proteinG: p.nutrition.protein,
            carbsG: p.nutrition.carbs,
            sugarG: p.nutrition.sugar,
            isAvailable: p.inStock,
          },
        })
      : await prisma.product.create({
          data: {
            name: p.name,
            price: p.price,
            categoryId,
            description: p.description,
            icon: p.icon,
            ingredients: p.ingredients,
            allergens: p.allergens,
            calories: p.nutrition.calories,
            proteinG: p.nutrition.protein,
            carbsG: p.nutrition.carbs,
            sugarG: p.nutrition.sugar,
            isAvailable: p.inStock,
          },
        });

    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: { stockQty: p.inStock ? 25 : 0 },
      create: { productId: product.id, stockQty: p.inStock ? 25 : 0, minStockThreshold: 5 },
    });
  }

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
