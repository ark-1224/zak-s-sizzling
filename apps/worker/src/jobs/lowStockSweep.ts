import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Logs products at or below their minimum stock threshold. This is the automated
 * side of the manuscript's low-stock alerting — the admin UI (Sprint 4's
 * /admin/inventory banner) covers the on-demand side. Wiring this into an actual
 * notification channel (email/SMS/push) needs credentials this environment doesn't
 * have configured, so it logs to stdout for now rather than claiming to notify anyone.
 */
export async function lowStockSweep(): Promise<{ name: string; stockQty: number; minStockThreshold: number }[]> {
  const rows = await prisma.product.findMany({
    include: { inventory: true },
    where: { inventory: { isNot: null } },
  });
  const low = rows
    .filter((p) => p.inventory && p.inventory.stockQty <= p.inventory.minStockThreshold)
    .map((p) => ({ name: p.name, stockQty: p.inventory!.stockQty, minStockThreshold: p.inventory!.minStockThreshold }));

  if (low.length === 0) {
    console.log("[low-stock] nothing below threshold");
  } else {
    console.log(`[low-stock] ${low.length} product(s) at or below minimum:`);
    for (const p of low) console.log(`  - ${p.name}: ${p.stockQty}/${p.minStockThreshold}`);
  }
  return low;
}

if (require.main === module) {
  lowStockSweep()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
