"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdmButton, Card, admInputClass, admLabelClass } from "@/components/admin/ui";
import { itemKey, manilaToday, peso, qty } from "@/lib/market";
import type { CreatePurchaseInput, PurchaseDTO, PurchaseKind, StockItemDTO, StockItemKind } from "@zaks/shared-types";

// Recording a market receipt (resibo) after the trip: one line per item, in the unit it
// was bought in (kg, tray, sack… or g/ml/pc), with what was paid for the line. Saving adds
// the stock and makes the price paid each item's cost. Lines from the shopping list keep
// what was planned, so the purchase shows planned against bought.

export interface PrefillLine {
  kind: StockItemKind;
  itemId: string;
  unitName: string;
  plannedUnits: number;
  /** The last price, to suggest a line total. */
  pricePerUnit: number | null;
}

interface LineState {
  key: string;
  item: string; // itemKey, or "" until chosen
  unitName: string;
  qtyUnits: string;
  lineTotal: string;
  expiresOn: string;
  plannedUnits: number | null;
}

let nextKey = 0;
const blankLine = (): LineState => ({ key: `l${nextKey++}`, item: "", unitName: "", qtyUnits: "", lineTotal: "", expiresOn: "", plannedUnits: null });

export function PurchaseForm({
  items,
  prefill,
  onCancel,
  onSaved,
}: {
  items: StockItemDTO[];
  prefill: PrefillLine[] | null;
  onCancel: () => void;
  onSaved: (saved: PurchaseDTO) => void;
}) {
  const byKey = new Map(items.map((i) => [itemKey(i.kind, i.itemId), i]));
  const [purchasedOn, setPurchasedOn] = useState(manilaToday());
  const [kind, setKind] = useState<PurchaseKind>("market_trip");
  const [store, setStore] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineState[]>(() =>
    prefill && prefill.length > 0
      ? prefill.map((p) => ({
          ...blankLine(),
          item: itemKey(p.kind, p.itemId),
          unitName: p.unitName,
          qtyUnits: qty(p.plannedUnits),
          lineTotal: p.pricePerUnit === null ? "" : (p.pricePerUnit * p.plannedUnits).toFixed(2),
          plannedUnits: p.plannedUnits,
        }))
      : [blankLine()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLine = (key: string, patch: Partial<LineState>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((sum, l) => sum + (Number(l.lineTotal) || 0), 0);

  async function save() {
    setError(null);
    const chosen = lines.filter((l) => l.item !== "");
    if (chosen.length === 0) return setError("Add at least one item from the receipt.");
    for (const l of chosen) {
      const item = byKey.get(l.item)!;
      if (!(Number(l.qtyUnits) >= 0) || l.qtyUnits === "") return setError(`${item.name}: enter how much was bought (0 if it wasn't found).`);
      if (!(Number(l.lineTotal) >= 0) || l.lineTotal === "") return setError(`${item.name}: enter what was paid for the line (0 if nothing).`);
    }
    const body: CreatePurchaseInput = {
      purchasedOn,
      kind,
      store: store.trim() || undefined,
      note: note.trim() || undefined,
      lines: chosen.map((l) => {
        const item = byKey.get(l.item)!;
        return {
          kind: item.kind,
          itemId: item.itemId,
          unitName: l.unitName || item.baseUnit,
          qtyUnits: Number(l.qtyUnits),
          lineTotal: Number(l.lineTotal),
          ...(l.plannedUnits !== null ? { plannedUnits: l.plannedUnits } : {}),
          ...(l.expiresOn ? { expiresOn: l.expiresOn } : {}),
        };
      }),
    };
    setSaving(true);
    try {
      onSaved(await apiFetch<PurchaseDTO>("/api/purchases", { method: "POST", auth: "staff", body: JSON.stringify(body) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the purchase.");
    } finally {
      setSaving(false);
    }
  }

  const materials = items.filter((i) => i.kind === "raw_material");
  const readyMade = items.filter((i) => i.kind === "ready_made");

  return (
    <Card title={prefill ? "Record the market trip (from the shopping list)" : "Record a market purchase"}>
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className={admLabelClass}>Date bought</span>
            <input type="date" value={purchasedOn} max={manilaToday()} onChange={(e) => setPurchasedOn(e.target.value)} className={admInputClass} />
          </label>
          <label className="block">
            <span className={admLabelClass}>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as PurchaseKind)} className={admInputClass}>
              <option value="market_trip">Market trip</option>
              <option value="top_up">Top-up between trips</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={admLabelClass}>Store or stall (optional)</span>
            <input value={store} maxLength={120} onChange={(e) => setStore(e.target.value)} placeholder="e.g. Bacoor public market" className={admInputClass} />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-base md:text-sm">
            <thead>
              <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="px-2 py-2 font-medium">Bought</th>
                <th className="px-2 py-2 font-medium">Unit</th>
                <th className="px-2 py-2 font-medium">Paid (₱)</th>
                <th className="px-2 py-2 font-medium">Printed expiry</th>
                <th className="py-2 pl-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const item = byKey.get(l.item);
                const units = item ? [item.baseUnit as string, ...item.units.map((u) => u.name)] : [];
                const size = item ? (item.units.find((u) => u.name === l.unitName)?.qtyInBase ?? 1) : 1;
                const base = item && Number(l.qtyUnits) > 0 ? Number(l.qtyUnits) * size : null;
                return (
                  <tr key={l.key} className="border-t border-adm-line-soft align-top">
                    <td className="py-2 pr-2">
                      <select
                        aria-label="Item"
                        value={l.item}
                        onChange={(e) => {
                          const next = byKey.get(e.target.value);
                          setLine(l.key, { item: e.target.value, unitName: next?.units[next.units.length - 1]?.name ?? next?.baseUnit ?? "" });
                        }}
                        className={admInputClass}
                      >
                        <option value="">Choose…</option>
                        <optgroup label="Raw materials">
                          {materials.map((i) => (
                            <option key={i.itemId} value={itemKey(i.kind, i.itemId)}>
                              {i.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Ready-made items">
                          {readyMade.map((i) => (
                            <option key={i.itemId} value={itemKey(i.kind, i.itemId)}>
                              {i.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      {l.plannedUnits !== null && (
                        <span className="mt-1 block text-sm text-adm-ink-3">
                          Planned {qty(l.plannedUnits)} {l.unitName}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        aria-label="How much was bought"
                        type="number"
                        min="0"
                        step="any"
                        value={l.qtyUnits}
                        onChange={(e) => setLine(l.key, { qtyUnits: e.target.value })}
                        className={`font-adm-mono ${admInputClass}`}
                      />
                      {base !== null && item && l.unitName !== item.baseUnit && (
                        <span className="mt-1 block text-sm text-adm-ink-3">
                          = {qty(base)} {item.baseUnit}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <select aria-label="Unit" value={l.unitName} disabled={!item} onChange={(e) => setLine(l.key, { unitName: e.target.value })} className={admInputClass}>
                        {units.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        aria-label="Paid for the line"
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.lineTotal}
                        onChange={(e) => setLine(l.key, { lineTotal: e.target.value })}
                        className={`font-adm-mono ${admInputClass}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input aria-label="Printed expiry date" type="date" value={l.expiresOn} onChange={(e) => setLine(l.key, { expiresOn: e.target.value })} className={admInputClass} />
                    </td>
                    <td className="py-2 pl-2">
                      <AdmButton type="button" variant="secondary" size="compact" aria-label="Remove line" onClick={() => setLines((all) => (all.length > 1 ? all.filter((x) => x.key !== l.key) : [blankLine()]))}>
                        ×
                      </AdmButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AdmButton type="button" variant="secondary" size="compact" onClick={() => setLines((all) => [...all, blankLine()])}>
            + Add a line
          </AdmButton>
          <span className="text-base md:text-sm">
            Receipt total <strong className="font-adm-mono">{peso(total)}</strong>
          </span>
        </div>
        <label className="block">
          <span className={admLabelClass}>Note (optional)</span>
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={admInputClass} />
        </label>
        <p className="text-sm text-adm-ink-3">
          Saving adds each item&apos;s stock and makes the price paid its cost, so recipe costs follow the market. A line with 0 bought records
          that it wasn&apos;t found. Purchases can&apos;t be edited afterwards; correct a mistake with Adjust on Raw materials.
        </p>
        {error && (
          <p role="alert" className="text-base text-adm-bad md:text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AdmButton type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </AdmButton>
          <AdmButton type="button" variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save purchase"}
          </AdmButton>
        </div>
      </div>
    </Card>
  );
}
