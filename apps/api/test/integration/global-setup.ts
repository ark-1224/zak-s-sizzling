import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { CATEGORY, PASSWORD, PRODUCTS, RAW_MATERIALS, USERS } from "./fixtures";

const apiDir = fileURLToPath(new URL("../..", import.meta.url));

// Runs once before all test files. vitest.config.ts has already pointed DATABASE_URL
// at the *_test database (and refuses any other name). `migrate deploy` brings that
// database's schema up to date without dropping anything; the tables are then emptied
// so each run starts from the same seeded state.
export default async function setup() {
  if (!process.env.DATABASE_URL?.match(/_test(\?|$)/)) {
    throw new Error("Integration tests need DATABASE_URL in apps/api/.env or TEST_DATABASE_URL (a *_test database)");
  }
  execSync("npx prisma migrate deploy", {
    cwd: apiDir,
    env: process.env,
    stdio: "pipe",
  });

  const prisma = new PrismaClient();
  try {
    const [{ current_database: database }] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
    if (!database.endsWith("_test")) throw new Error(`Refusing to empty "${database}": not a *_test database`);

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length > 0) {
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }

    const roles = new Map<string, number>();
    for (const name of ["admin", "staff", "customer"] as const) {
      const role = await prisma.role.create({ data: { name } });
      roles.set(name, role.id);
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 4); // low cost: test speed only
    for (const user of Object.values(USERS)) {
      await prisma.user.create({
        data: { name: user.name, email: user.email, passwordHash, isActive: user.isActive, roleId: roles.get(user.role)! },
      });
    }

    const materialIds = new Map<string, string>();
    for (const [key, material] of Object.entries(RAW_MATERIALS)) {
      const row = await prisma.rawMaterial.create({ data: material });
      materialIds.set(key, row.id);
    }

    const category = await prisma.category.create({ data: CATEGORY });
    for (const product of Object.values(PRODUCTS)) {
      await prisma.product.create({
        data: {
          id: product.id,
          name: product.name,
          price: product.price,
          cost: "cost" in product ? product.cost : null,
          barcode: product.barcode,
          isAvailable: product.isAvailable,
          tracking: product.tracking,
          categoryId: category.id,
          inventory: { create: { stockQty: product.stockQty, minStockThreshold: 5 } },
          recipeItems: {
            create: product.recipe.map(([material, qtyPerServing]) => ({ rawMaterialId: materialIds.get(material)!, qtyPerServing })),
          },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
