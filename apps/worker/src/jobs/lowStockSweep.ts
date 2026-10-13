import "dotenv/config";
import { prisma } from "../lib/prisma";

export interface LowStockItem {
  kind: "product" | "raw material";
  name: string;
  stockQty: number;
  minStockThreshold: number;
  unit: string | null;
}

/**
 * Logs unit-counted products and raw materials at or below their minimum level, every
 * hour. The admin UI (the dashboard, Inventory and Raw materials banners) shows the same
 * list on demand, and an email goes out when an item first reaches its minimum
 * (sendLowStockAlerts.ts). Recipe dishes aren't listed themselves: they run low when one
 * of their raw materials does (docs/design/raw-material-stock.md 3.5).
 */
export async function lowStockSweep(): Promise<LowStockItem[]> {
  const [products, materials] = await Promise.all([
    prisma.product.findMany({ include: { inventory: true }, where: { tracking: "unit", inventory: { isNot: null } } }),
    prisma.rawMaterial.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const low: LowStockItem[] = [
    ...products
      .filter((p) => p.inventory && p.inventory.stockQty <= p.inventory.minStockThreshold)
      .map((p) => ({ kind: "product" as const, name: p.name, stockQty: p.inventory!.stockQty, minStockThreshold: p.inventory!.minStockThreshold, unit: null })),
    ...materials
      .filter((m) => m.stockQty.lte(m.minStockThreshold))
      .map((m) => ({ kind: "raw material" as const, name: m.name, stockQty: m.stockQty.toNumber(), minStockThreshold: m.minStockThreshold.toNumber(), unit: m.unit })),
  ];

  if (low.length === 0) {
    console.log("[low-stock] nothing below threshold");
  } else {
    console.log(`[low-stock] ${low.length} item(s) at or below minimum:`);
    for (const item of low) {
      const unit = item.unit ? ` ${item.unit}` : "";
      console.log(`  - ${item.name} (${item.kind}): ${item.stockQty}${unit}/${item.minStockThreshold}${unit}`);
    }
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
