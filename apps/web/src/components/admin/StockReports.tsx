"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Card, admInputClass, admLabelClass } from "@/components/admin/ui";
import { REASON_LABELS } from "@/components/admin/AdjustStockModal";
import { formatMaterialQty } from "@/lib/units";
import { addDays, itemKey, manilaToday, peso, shortDay } from "@/lib/market";
import type { FoodCostReportDTO, UsageReportDTO } from "@zaks/shared-types";

// Analytics for the palengke cycle, over a period of days (default the last 14, one
// market cycle): food cost (from recipes, and from what was spent at the market), each
// market trip's spending against the sales until the next trip (puhunan vs benta), and
// usage and waste per item.

export function StockReports() {
  const [to, setTo] = useState(manilaToday());
  const [from, setFrom] = useState(addDays(manilaToday(), -13));
  const [food, setFood] = useState<FoodCostReportDTO | null>(null);
  const [usage, setUsage] = useState<UsageReportDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!from || !to || from > to) return;
    let cancelled = false;
    Promise.all([
      apiFetch<FoodCostReportDTO>(`/api/reports/food-cost?from=${from}&to=${to}`, { auth: "staff" }),
      apiFetch<UsageReportDTO>(`/api/reports/usage?from=${from}&to=${to}`, { auth: "staff" }),
    ])
      .then(([f, u]) => {
        if (cancelled) return;
        setFood(f);
        setUsage(u);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load the food cost and usage reports."));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className={admLabelClass}>From</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={admInputClass} />
        </label>
        <label className="block">
          <span className={admLabelClass}>To</span>
          <input type="date" value={to} min={from} max={manilaToday()} onChange={(e) => setTo(e.target.value)} className={admInputClass} />
        </label>
      </div>
      {error && <p className="text-base text-adm-bad md:text-sm">{error}</p>}

      {food && (
        <Card title={`Food cost · ${shortDay(food.from)} to ${shortDay(food.to)}`}>
          <dl className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
            <Figure label="From recipes" value={pct(food.recipeFoodCostPct)} sub={`${peso(food.recipeCost)} cost of ${peso(food.salesWithCost)} sold`} />
            <Figure label="From market purchases" value={pct(food.purchaseFoodCostPct)} sub={`${peso(food.purchases)} spent · ${peso(food.sales)} sales`} />
            <Figure label="Sales without a cost" value={peso(food.uncostedSales)} sub="Dishes sold before their prices were known" />
          </dl>
          <p className="px-4 pb-3 text-sm text-adm-ink-3">
            From recipes: what the dishes sold should have cost, at the prices when they were paid. From purchases: what was actually spent. A
            purchase figure well above the recipe one points to waste, over-portioning or stock not yet used.
          </p>
          {food.trips.length > 0 && (
            <div className="overflow-x-auto border-t border-adm-line-soft">
              <table className="w-full min-w-[560px] text-base md:text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                    <th className="px-4 py-2.5 font-medium">Market trip</th>
                    <th className="px-3 py-2.5 text-right font-medium">Spent (with top-ups)</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sales until next trip</th>
                    <th className="px-4 py-2.5 text-right font-medium">Spent ÷ sales</th>
                  </tr>
                </thead>
                <tbody>
                  {food.trips.map((t) => (
                    <tr key={t.purchaseId} className="border-t border-adm-line-soft">
                      <td className="px-4 py-2.5">
                        {shortDay(t.purchasedOn)} {t.untilOn ? `to ${shortDay(t.untilOn)}` : "(current)"}
                      </td>
                      <td className="font-adm-mono px-3 py-2.5 text-right">
                        {peso(t.spent)}
                        {t.topUps > 0 && <span className="block text-sm text-adm-ink-3">incl. {peso(t.topUps)} top-ups</span>}
                      </td>
                      <td className="font-adm-mono px-3 py-2.5 text-right">{peso(t.sales)}</td>
                      <td className="font-adm-mono px-4 py-2.5 text-right">{t.ratio === null ? "—" : `${(t.ratio * 100).toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {usage && (
        <Card title={`Usage and waste · ${usage.days} day${usage.days !== 1 ? "s" : ""} · waste ${peso(usage.totalWastedValue)}`}>
          {usage.wasteByReason.length > 0 && (
            <p className="px-4 pt-3 text-base md:text-sm">
              Waste by reason:{" "}
              {usage.wasteByReason.map((w) => `${REASON_LABELS[w.reason]} ${peso(w.value)}`).join(" · ")}
            </p>
          )}
          {usage.rows.length === 0 ? (
            <p className="p-4 text-adm-ink-3">Nothing used, wasted or bought in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-base md:text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                    <th className="px-4 py-2.5 font-medium">Item</th>
                    <th className="px-3 py-2.5 text-right font-medium">Used</th>
                    <th className="px-3 py-2.5 text-right font-medium">Per day</th>
                    <th className="px-3 py-2.5 text-right font-medium">Wasted</th>
                    <th className="px-3 py-2.5 text-right font-medium">Bought</th>
                    <th className="px-4 py-2.5 text-right font-medium">On hand</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.rows.map((r) => (
                    <tr key={itemKey(r.kind, r.itemId)} className="border-t border-adm-line-soft">
                      <td className="px-4 py-2.5">{r.itemName}</td>
                      <td className="font-adm-mono px-3 py-2.5 text-right">
                        {formatMaterialQty(r.used, r.baseUnit)}
                        {r.usedValue !== null && <span className="block text-sm text-adm-ink-3">{peso(r.usedValue)}</span>}
                      </td>
                      <td className="font-adm-mono px-3 py-2.5 text-right">{formatMaterialQty(r.avgDailyUsage, r.baseUnit)}</td>
                      <td className={`font-adm-mono px-3 py-2.5 text-right ${r.wasted > 0 ? "text-adm-bad" : ""}`}>
                        {formatMaterialQty(r.wasted, r.baseUnit)}
                        {r.wastedValue !== null && r.wasted > 0 && <span className="block text-sm">{peso(r.wastedValue)}</span>}
                      </td>
                      <td className="font-adm-mono px-3 py-2.5 text-right">{formatMaterialQty(r.purchased, r.baseUnit)}</td>
                      <td className="font-adm-mono px-4 py-2.5 text-right">{formatMaterialQty(r.onHand, r.baseUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="text-xs tracking-[.07em] text-adm-ink-3 uppercase">{label}</dt>
      <dd className="font-adm-mono mt-1 text-2xl font-semibold">{value}</dd>
      <dd className="text-sm text-adm-ink-3">{sub}</dd>
    </div>
  );
}
