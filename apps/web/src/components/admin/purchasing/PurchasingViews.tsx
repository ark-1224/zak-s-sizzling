"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdmButton, Card, StatusPill, admInputClass, admLabelClass } from "@/components/admin/ui";
import { formatMaterialQty } from "@/lib/units";
import { itemKey, peso, qty, shortDay } from "@/lib/market";
import type { PriceHistoryDTO, PurchaseDTO, ShoppingListDTO, StockItemDTO } from "@zaks/shared-types";
import type { PrefillLine } from "./PurchaseForm";

// The three tabs of Market purchases: the shopping list for the next trip, the receipts
// recorded so far (planned against bought), and each item's price over time.

const DAYS_KEY = "zaks.market.tripDays";

export function ShoppingListView({ onRecord }: { onRecord: (prefill: PrefillLine[]) => void }) {
  const [days, setDays] = useState(() => {
    try {
      return Number(window.localStorage.getItem(DAYS_KEY)) || 14;
    } catch {
      return 14;
    }
  });
  const [list, setList] = useState<ShoppingListDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ShoppingListDTO>(`/api/purchases/shopping-list?days=${days}`, { auth: "staff" })
      .then((l) => !cancelled && (setList(l), setError(null)))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load the shopping list."));
    try {
      window.localStorage.setItem(DAYS_KEY, String(days));
    } catch {
      // Not remembered on this device; nothing else changes.
    }
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-44">
          <span className={admLabelClass}>Days until the next trip</span>
          <input type="number" min="1" max="60" value={days} onChange={(e) => setDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} className={`font-adm-mono ${admInputClass}`} />
        </label>
        {list && list.items.length > 0 && (
          <>
            <AdmButton type="button" variant="secondary" onClick={() => window.print()}>
              Print list
            </AdmButton>
            <AdmButton
              type="button"
              variant="primary"
              onClick={() =>
                onRecord(list.items.map((i) => ({ kind: i.kind, itemId: i.itemId, unitName: i.unitName, plannedUnits: i.buyUnits, pricePerUnit: i.lastPricePerUnit })))
              }
            >
              Record the trip from this list
            </AdmButton>
          </>
        )}
      </div>
      <p className="text-base text-adm-ink-2 md:text-sm">
        For each item: what sales and waste used per day over the last {list?.usageWindowDays ?? 28} days × the days to cover, plus the safety stock,
        never above the par level, minus what&apos;s on hand, rounded up to market units. A rule over recent usage, not a forecast.
      </p>
      {error && <p className="text-base text-adm-bad md:text-sm">{error}</p>}
      {list === null ? (
        !error && <div className="text-adm-ink-3">Loading…</div>
      ) : list.items.length === 0 ? (
        <div className="text-adm-ink-3">Nothing to buy for the next {days} days: stock covers the expected usage.</div>
      ) : (
        <Card title={`Shopping list · ${list.items.length} item${list.items.length !== 1 ? "s" : ""} · about ${peso(list.estimatedTotal)} to bring`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-base md:text-sm">
              <thead>
                <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-3 py-2.5 text-right font-medium">On hand</th>
                  <th className="px-3 py-2.5 text-right font-medium">Used / day</th>
                  <th className="px-3 py-2.5 font-medium">Buy</th>
                  <th className="px-4 py-2.5 text-right font-medium">About</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((i) => (
                  <tr key={itemKey(i.kind, i.itemId)} className="border-t border-adm-line-soft align-top">
                    <td className="px-4 py-2.5">
                      {i.itemName}
                      {i.shortShelfLife && (
                        <span className="mt-1 block text-sm text-adm-warn">
                          Stays fresh {i.shelfLifeDays} days: bought for {i.coverDays} days only. Plan a top-up.
                        </span>
                      )}
                    </td>
                    <td className="font-adm-mono px-3 py-2.5 text-right">{formatMaterialQty(i.onHand, i.baseUnit)}</td>
                    <td className="font-adm-mono px-3 py-2.5 text-right">{formatMaterialQty(i.avgDailyUsage, i.baseUnit)}</td>
                    <td className="px-3 py-2.5">
                      <strong className="font-adm-mono">
                        {qty(i.buyUnits)} {i.unitName}
                      </strong>
                      {i.unitName !== i.baseUnit && <span className="block text-sm text-adm-ink-3">needs {formatMaterialQty(i.buyBase, i.baseUnit)}</span>}
                    </td>
                    <td className="font-adm-mono px-4 py-2.5 text-right">{i.estimatedCost === null ? "no price yet" : peso(i.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.itemsWithoutPrice > 0 && (
            <p className="px-4 pb-3 text-sm text-adm-ink-3">
              {list.itemsWithoutPrice} item{list.itemsWithoutPrice !== 1 ? "s have" : " has"} no price yet, so the total leaves {list.itemsWithoutPrice !== 1 ? "them" : "it"} out.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

export function PurchaseListView({ version }: { version: number }) {
  const [purchases, setPurchases] = useState<PurchaseDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PurchaseDTO[]>("/api/purchases?limit=60", { auth: "staff" })
      .then((p) => (setPurchases(p), setError(null)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the purchases."));
  }, [version]);

  if (error) return <p className="text-base text-adm-bad md:text-sm">{error}</p>;
  if (purchases === null) return <div className="text-adm-ink-3">Loading…</div>;
  if (purchases.length === 0) return <div className="text-adm-ink-3">No market purchases recorded yet.</div>;
  return (
    <Card>
      <ul className="divide-y divide-adm-line-soft">
        {purchases.map((p) => (
          <li key={p.id} className="p-4">
            <button type="button" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full flex-wrap items-center gap-2 text-left">
              <strong>{shortDay(p.purchasedOn)}</strong>
              <StatusPill tone={p.kind === "market_trip" ? "ok" : "warn"}>{p.kind === "market_trip" ? "MARKET TRIP" : "TOP-UP"}</StatusPill>
              <span className="text-adm-ink-2">{p.store ?? "—"}</span>
              <span className="ml-auto font-adm-mono">{peso(p.totalAmount)}</span>
              <span className="w-full text-sm text-adm-ink-3">
                {p.lines.length} line{p.lines.length !== 1 ? "s" : ""} · recorded by {p.createdByName}
              </span>
            </button>
            {open === p.id && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-base md:text-sm">
                  <thead>
                    <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                      <th className="py-2 pr-2 font-medium">Item</th>
                      <th className="px-2 py-2 font-medium">Planned</th>
                      <th className="px-2 py-2 font-medium">Bought</th>
                      <th className="px-2 py-2 text-right font-medium">Price</th>
                      <th className="py-2 pl-2 text-right font-medium">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lines.map((l) => (
                      <tr key={l.id} className="border-t border-adm-line-soft">
                        <td className="py-2 pr-2">
                          {l.itemName}
                          {l.expiresOn && <span className="block text-sm text-adm-ink-3">expires {shortDay(l.expiresOn)}</span>}
                        </td>
                        <td className="font-adm-mono px-2 py-2">{l.plannedUnits === null ? "—" : `${qty(l.plannedUnits)} ${l.unitName}`}</td>
                        <td className="font-adm-mono px-2 py-2">
                          {l.qtyUnits === 0 ? <span className="text-adm-warn">not found</span> : `${qty(l.qtyUnits)} ${l.unitName}`}
                          {l.plannedUnits !== null && l.qtyUnits > 0 && l.qtyUnits !== l.plannedUnits && (
                            <span className="block text-sm text-adm-ink-3">{l.qtyUnits > l.plannedUnits ? "more" : "less"} than planned</span>
                          )}
                        </td>
                        <td className="font-adm-mono px-2 py-2 text-right">{l.pricePerUnit === null ? "—" : `${peso(l.pricePerUnit)}/${l.unitName}`}</td>
                        <td className="font-adm-mono py-2 pl-2 text-right">{peso(l.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {p.note && <p className="mt-2 text-sm text-adm-ink-2">{p.note}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function PriceHistoryView({ items }: { items: StockItemDTO[] }) {
  const [chosen, setChosen] = useState("");
  const [history, setHistory] = useState<PriceHistoryDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chosen) return;
    const [kind, itemId] = chosen.split(":");
    apiFetch<PriceHistoryDTO>(`/api/purchases/prices?kind=${kind}&itemId=${itemId}`, { auth: "staff" })
      .then((h) => (setHistory(h), setError(null)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the prices."));
  }, [chosen]);

  const points = history?.points ?? [];
  const perBase = points.map((p) => p.pricePerBase);
  const min = Math.min(...perBase);
  const max = Math.max(...perBase);
  const spark =
    points.length > 1
      ? points.map((p, i) => `${(i / (points.length - 1)) * 300},${max === min ? 30 : 56 - ((p.pricePerBase - min) / (max - min)) * 52}`).join(" ")
      : null;

  return (
    <div className="flex flex-col gap-3">
      <label className="block sm:max-w-80">
        <span className={admLabelClass}>Item</span>
        <select value={chosen} onChange={(e) => setChosen(e.target.value)} className={admInputClass}>
          <option value="">Choose an item…</option>
          {items.map((i) => (
            <option key={itemKey(i.kind, i.itemId)} value={itemKey(i.kind, i.itemId)}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-base text-adm-bad md:text-sm">{error}</p>}
      {chosen && history && (
        <Card title={`${history.itemName} · price per ${history.baseUnit} over time`}>
          {points.length === 0 ? (
            <p className="p-4 text-adm-ink-3">Not bought yet.</p>
          ) : (
            <>
              {spark && (
                <svg viewBox="0 0 300 60" className="mx-4 mt-3 h-16 w-[calc(100%-2rem)]" role="img" aria-label={`Price trend for ${history.itemName}`}>
                  <polyline points={spark} fill="none" stroke="var(--adm-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-base md:text-sm">
                  <thead>
                    <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                      <th className="px-4 py-2.5 font-medium">Bought</th>
                      <th className="px-3 py-2.5 font-medium">Amount</th>
                      <th className="px-3 py-2.5 text-right font-medium">Price</th>
                      <th className="px-4 py-2.5 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points].reverse().map((p, i, all) => {
                      const prev = all[i + 1];
                      const change = prev ? ((p.pricePerBase - prev.pricePerBase) / prev.pricePerBase) * 100 : null;
                      return (
                        <tr key={`${p.purchasedOn}-${i}`} className="border-t border-adm-line-soft">
                          <td className="px-4 py-2.5">
                            {shortDay(p.purchasedOn)}
                            {p.store && <span className="block text-sm text-adm-ink-3">{p.store}</span>}
                          </td>
                          <td className="font-adm-mono px-3 py-2.5">
                            {qty(p.qtyUnits)} {p.unitName}
                          </td>
                          <td className="font-adm-mono px-3 py-2.5 text-right">
                            {peso(p.pricePerUnit)}/{p.unitName}
                          </td>
                          <td className={`font-adm-mono px-4 py-2.5 text-right ${change === null ? "" : change > 0 ? "text-adm-bad" : change < 0 ? "text-adm-ok" : ""}`}>
                            {change === null ? "—" : `${change > 0 ? "▲" : change < 0 ? "▼" : ""} ${Math.abs(change).toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
