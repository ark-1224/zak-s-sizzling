import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { StockCountDTO, StockCountLineDTO, StockCountSummaryDTO, UserRole } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { getStockItem, itemKey, type StockItem } from "../purchasing/stockItems";
import { refreshAvailability } from "./fulfillment";
import { flowFor, stockFlows } from "./flows";
import type { createStockCountSchema } from "./schema";

// The count sheet (planned before each market trip, every two weeks): staff count what's
// actually there, the system records what it expected, and sets the stock to the count.
// The difference is the variance (inventory record inaccuracy): what went missing that no
// sale or recorded waste explains. Each line also shows what moved since the item's
// previous count (bought, sold, wasted), so a large gap can be traced.

type CreateStockCount = z.infer<typeof createStockCountSchema>;
const D = (n: number | Prisma.Decimal) => new Prisma.Decimal(n);

export async function createStockCount(input: CreateStockCount, userId: string): Promise<StockCountDTO> {
  const keys = new Set<string>();
  const items: { item: StockItem; counted: number }[] = [];
  for (const line of input.lines) {
    const key = itemKey(line.kind, line.itemId);
    if (keys.has(key)) throw new HttpError(400, "Each item can be counted once per count");
    keys.add(key);
    const item = await getStockItem(line.kind, line.itemId);
    if (item.kind === "ready_made" && !Number.isInteger(line.countedQty)) throw new HttpError(400, `${item.name} is counted in whole pieces`);
    items.push({ item, counted: line.countedQty });
  }

  const touched = { productIds: [] as string[], materialIds: [] as string[] };
  const count = await prisma.$transaction(async (tx) => {
    const count = await tx.stockCount.create({ data: { note: input.note || null, createdById: userId } });
    for (const { item, counted } of items) {
      if (item.kind === "raw_material") {
        const current = await tx.rawMaterial.findUniqueOrThrow({ where: { id: item.itemId } });
        const countedQty = D(counted).toDecimalPlaces(3);
        await tx.stockCountLine.create({
          data: { stockCountId: count.id, rawMaterialId: item.itemId, systemQty: current.stockQty, countedQty, unitCost: current.costPerUnit },
        });
        if (!current.stockQty.equals(countedQty)) {
          await tx.rawMaterial.update({ where: { id: item.itemId }, data: { stockQty: countedQty } });
          await tx.rawMaterialMovement.create({
            data: {
              rawMaterialId: item.itemId,
              delta: countedQty.sub(current.stockQty),
              previousQty: current.stockQty,
              newQty: countedQty,
              type: "adjustment",
              reason: "correction",
              note: "Stock count",
              stockCountId: count.id,
              adjustedById: userId,
            },
          });
          touched.materialIds.push(item.itemId);
        }
      } else {
        const current = await tx.inventory.findUniqueOrThrow({ where: { productId: item.itemId }, include: { product: { select: { cost: true } } } });
        await tx.stockCountLine.create({
          data: { stockCountId: count.id, productId: item.itemId, systemQty: D(current.stockQty), countedQty: D(counted), unitCost: current.product.cost },
        });
        if (current.stockQty !== counted) {
          await tx.inventory.update({ where: { productId: item.itemId }, data: { stockQty: counted } });
          await tx.stockAdjustment.create({
            data: {
              productId: item.itemId,
              delta: counted - current.stockQty,
              previousQty: current.stockQty,
              newQty: counted,
              reason: "correction",
              note: "Stock count",
              stockCountId: count.id,
              adjustedById: userId,
            },
          });
          touched.productIds.push(item.itemId);
        }
      }
    }
    return count;
  });

  await refreshAvailability(touched);
  return getStockCount(count.id, "admin");
}

const LINE_INCLUDE = {
  rawMaterial: { select: { name: true, unit: true } },
  product: { select: { name: true } },
} satisfies Prisma.StockCountLineInclude;

export async function getStockCount(id: string, role: UserRole | undefined): Promise<StockCountDTO> {
  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true } }, lines: { include: LINE_INCLUDE } },
  });
  if (!count) throw new HttpError(404, "Stock count not found");

  // Each item's previous count, and the window since it, for the "since" breakdown.
  const previous = await prisma.stockCountLine.findMany({
    where: {
      stockCount: { countedAt: { lt: count.countedAt } },
      OR: [
        { rawMaterialId: { in: count.lines.flatMap((l) => (l.rawMaterialId ? [l.rawMaterialId] : [])) } },
        { productId: { in: count.lines.flatMap((l) => (l.productId ? [l.productId] : [])) } },
      ],
    },
    include: { stockCount: { select: { countedAt: true } } },
    orderBy: { stockCount: { countedAt: "desc" } },
  });
  const prevByItem = new Map<string, { countedQty: number; countedAt: Date }>();
  for (const p of previous) {
    const key = p.rawMaterialId ? itemKey("raw_material", p.rawMaterialId) : itemKey("ready_made", p.productId!);
    if (!prevByItem.has(key)) prevByItem.set(key, { countedQty: Number(p.countedQty), countedAt: p.stockCount.countedAt });
  }
  // Items never counted before: since 30 days ago.
  const fallbackFrom = new Date(count.countedAt.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Items sharing a previous count share its window, so each window is read once.
  const windows = new Map<number, Awaited<ReturnType<typeof stockFlows>>>();
  const flowsFrom = async (from: Date) => {
    const cached = windows.get(from.getTime());
    if (cached) return cached;
    const flows = await stockFlows(from, count.countedAt);
    windows.set(from.getTime(), flows);
    return flows;
  };

  const admin = role === "admin";
  const lines: StockCountLineDTO[] = [];
  let totalValue = 0;
  let valued = false;
  for (const l of count.lines) {
    const kind = l.rawMaterialId ? ("raw_material" as const) : ("ready_made" as const);
    const itemId = (l.rawMaterialId ?? l.productId)!;
    const key = itemKey(kind, itemId);
    const prev = prevByItem.get(key);
    const flow = flowFor(await flowsFrom(prev?.countedAt ?? fallbackFrom), key);
    const difference = Number(l.countedQty.sub(l.systemQty));
    const value = l.unitCost === null ? null : Math.round(difference * Number(l.unitCost) * 100) / 100;
    if (value !== null) {
      totalValue += value;
      valued = true;
    }
    lines.push({
      kind,
      itemId,
      itemName: l.rawMaterial?.name ?? l.product?.name ?? "",
      baseUnit: l.rawMaterial?.unit ?? "pc",
      systemQty: Number(l.systemQty),
      countedQty: Number(l.countedQty),
      difference,
      ...(admin ? { differenceValue: value } : {}),
      since: {
        previousCountedQty: prev?.countedQty ?? null,
        purchased: round3(flow.purchased),
        sold: round3(flow.sold),
        wasted: round3(flow.wasted),
        otherAdjustments: round3(flow.other),
      },
    });
  }
  lines.sort((a, b) => Math.abs(b.differenceValue ?? b.difference) - Math.abs(a.differenceValue ?? a.difference) || a.itemName.localeCompare(b.itemName));

  const prevCount = await prisma.stockCount.findFirst({ where: { countedAt: { lt: count.countedAt } }, orderBy: { countedAt: "desc" }, select: { countedAt: true } });
  return {
    id: count.id,
    countedAt: count.countedAt.toISOString(),
    note: count.note,
    createdByName: count.createdBy.name,
    previousCountAt: prevCount?.countedAt.toISOString() ?? null,
    lines,
    ...(admin ? { totalDifferenceValue: valued ? Math.round(totalValue * 100) / 100 : null } : {}),
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function listStockCounts(role: UserRole | undefined): Promise<StockCountSummaryDTO[]> {
  const counts = await prisma.stockCount.findMany({
    include: { createdBy: { select: { name: true } }, lines: { select: { systemQty: true, countedQty: true, unitCost: true } } },
    orderBy: { countedAt: "desc" },
    take: 30,
  });
  return counts.map((c) => {
    const values = c.lines.filter((l) => l.unitCost !== null).map((l) => Number(l.countedQty.sub(l.systemQty)) * Number(l.unitCost));
    return {
      id: c.id,
      countedAt: c.countedAt.toISOString(),
      createdByName: c.createdBy.name,
      itemCount: c.lines.length,
      itemsOff: c.lines.filter((l) => !l.countedQty.equals(l.systemQty)).length,
      ...(role === "admin" ? { totalDifferenceValue: values.length ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : null } : {}),
    };
  });
}
