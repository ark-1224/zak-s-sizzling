import { Prisma } from "@prisma/client";
import type { AdjustmentReason, FoodCostReportDTO, FoodCostTripDTO, UsageReportDTO } from "@zaks/shared-types";
import { prisma } from "../../lib/prisma";
import { flowFor, stockFlows } from "../inventory/flows";
import { addDays, dateOnly, daysBetween, itemKey, listStockItems, manilaDay, startOfManilaDay } from "../purchasing/stockItems";

// Two Analytics reports for the palengke cycle, over a period of Manila days (default the
// last 14 days, one market cycle):
// - Usage and waste per item: what sales used, what was thrown away (with its peso value
//   at today's cost), what was bought, and the average used per day.
// - Food cost: what the dishes sold cost (each line's cost saved when it was paid) as a
//   share of their sales, what was spent at the market against all sales, and each market
//   trip's spending (with its top-ups) against the sales until the next trip.

const PAID_STATUSES = ["confirmed", "preparing", "ready", "completed"] as const;
const DEFAULT_DAYS = 14;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function resolvePeriod(from?: string, to?: string, now = new Date()) {
  const end = to ?? manilaDay(now);
  const start = from ?? addDays(end, -(DEFAULT_DAYS - 1));
  return { from: start, to: end, days: daysBetween(start, end) + 1, start: startOfManilaDay(start), end: startOfManilaDay(addDays(end, 1)) };
}

export async function getUsageReport(fromDay?: string, toDay?: string): Promise<UsageReportDTO> {
  const period = resolvePeriod(fromDay, toDay);
  const [items, flows] = await Promise.all([listStockItems(), stockFlows(period.start, period.end)]);
  const wasteByReason = new Map<AdjustmentReason, number>();
  let totalWasted = 0;

  const rows = items
    .map((item) => {
      const flow = flowFor(flows, itemKey(item.kind, item.itemId));
      const cost = item.costPerBase;
      for (const [reason, qty] of Object.entries(flow.wastedByReason) as [AdjustmentReason, number][]) {
        if (cost !== null) wasteByReason.set(reason, (wasteByReason.get(reason) ?? 0) + qty * cost);
      }
      if (cost !== null) totalWasted += flow.wasted * cost;
      return {
        kind: item.kind,
        itemId: item.itemId,
        itemName: item.name,
        baseUnit: item.baseUnit,
        used: round3(flow.sold),
        wasted: round3(flow.wasted),
        purchased: round3(flow.purchased),
        avgDailyUsage: round3(flow.sold / period.days),
        onHand: item.onHand,
        usedValue: cost === null ? null : round2(flow.sold * cost),
        wastedValue: cost === null ? null : round2(flow.wasted * cost),
      };
    })
    .filter((r) => r.used !== 0 || r.wasted !== 0 || r.purchased !== 0)
    .sort((a, b) => (b.usedValue ?? 0) - (a.usedValue ?? 0) || a.itemName.localeCompare(b.itemName));

  return {
    from: period.from,
    to: period.to,
    days: period.days,
    rows,
    totalWastedValue: round2(totalWasted),
    wasteByReason: [...wasteByReason.entries()].map(([reason, value]) => ({ reason, value: round2(value) })).sort((a, b) => b.value - a.value),
  };
}

/** Sales of paid orders placed in [start, end). */
async function salesBetween(start: Date, end: Date): Promise<number> {
  const agg = await prisma.order.aggregate({ where: { status: { in: [...PAID_STATUSES] }, createdAt: { gte: start, lt: end } }, _sum: { totalAmount: true } });
  return Number(agg._sum.totalAmount ?? 0);
}

export async function getFoodCostReport(fromDay?: string, toDay?: string, now = new Date()): Promise<FoodCostReportDTO> {
  const period = resolvePeriod(fromDay, toDay, now);
  const lines = await prisma.orderItem.findMany({
    where: { qty: { gt: 0 }, order: { status: { in: [...PAID_STATUSES] }, createdAt: { gte: period.start, lt: period.end } } },
    select: { qty: true, subtotal: true, unitCost: true },
  });
  let recipeCost = new Prisma.Decimal(0);
  let salesWithCost = new Prisma.Decimal(0);
  let uncosted = new Prisma.Decimal(0);
  for (const l of lines) {
    if (l.unitCost === null) uncosted = uncosted.add(l.subtotal);
    else {
      recipeCost = recipeCost.add(l.unitCost.mul(l.qty));
      salesWithCost = salesWithCost.add(l.subtotal);
    }
  }
  const sales = await salesBetween(period.start, period.end);
  const purchasesAgg = await prisma.purchase.aggregate({
    where: { purchasedOn: { gte: new Date(`${period.from}T00:00:00Z`), lte: new Date(`${period.to}T00:00:00Z`) } },
    _sum: { totalAmount: true },
  });
  const purchases = Number(purchasesAgg._sum.totalAmount ?? 0);

  // Market trips in the period, each with its top-ups and the sales until the next trip.
  const trips = await prisma.purchase.findMany({
    where: { kind: "market_trip", purchasedOn: { gte: new Date(`${period.from}T00:00:00Z`), lte: new Date(`${period.to}T00:00:00Z`) } },
    orderBy: [{ purchasedOn: "asc" }, { createdAt: "asc" }],
    select: { id: true, purchasedOn: true, totalAmount: true },
  });
  const tripRows: FoodCostTripDTO[] = [];
  for (const trip of trips) {
    const day = dateOnly(trip.purchasedOn);
    const next = await prisma.purchase.findFirst({
      where: { kind: "market_trip", purchasedOn: { gt: trip.purchasedOn } },
      orderBy: { purchasedOn: "asc" },
      select: { purchasedOn: true },
    });
    const untilOn = next ? dateOnly(next.purchasedOn) : null;
    const topUps = await prisma.purchase.aggregate({
      where: { kind: "top_up", purchasedOn: { gte: trip.purchasedOn, ...(next ? { lt: next.purchasedOn } : {}) } },
      _sum: { totalAmount: true },
    });
    const spent = Number(trip.totalAmount) + Number(topUps._sum.totalAmount ?? 0);
    const tripSales = await salesBetween(startOfManilaDay(day), untilOn ? startOfManilaDay(untilOn) : now);
    tripRows.push({
      purchaseId: trip.id,
      purchasedOn: day,
      untilOn,
      spent: round2(spent),
      topUps: round2(Number(topUps._sum.totalAmount ?? 0)),
      sales: round2(tripSales),
      ratio: tripSales > 0 ? round3(spent / tripSales) : null,
    });
  }

  return {
    from: period.from,
    to: period.to,
    sales: round2(sales),
    recipeCost: round2(Number(recipeCost)),
    salesWithCost: round2(Number(salesWithCost)),
    recipeFoodCostPct: salesWithCost.isZero() ? null : round2(Number(recipeCost.div(salesWithCost)) * 100),
    purchases: round2(purchases),
    purchaseFoodCostPct: sales > 0 ? round2((purchases / sales) * 100) : null,
    uncostedSales: round2(Number(uncosted)),
    trips: tripRows,
  };
}
