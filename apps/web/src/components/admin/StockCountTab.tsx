"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdmButton, Card, StatusPill, admInputClass, admLabelClass } from "@/components/admin/ui";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { formatMaterialQty } from "@/lib/units";
import { formatDateTime } from "@/lib/time";
import { itemKey, peso, qty } from "@/lib/market";
import type { StockCountDTO, StockCountSummaryDTO, StockItemDTO } from "@zaks/shared-types";

// The Stock count tab on Raw materials: the count sheet, done before each market trip.
// Staff type what's actually there; the system's own figure is hidden until the count is
// saved, so it doesn't sway the count. Saving sets the stock to the count and shows the
// variance: expected against counted, with what was bought, sold and wasted since the
// item's previous count, so a large gap can be traced (inventory record inaccuracy).

export function StockCountTab({ isAdmin, onCounted }: { isAdmin: boolean; onCounted: () => void }) {
  const [items, setItems] = useState<StockItemDTO[] | null>(null);
  const [counts, setCounts] = useState<StockCountSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<StockCountDTO | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, c] = await Promise.all([
        apiFetch<StockItemDTO[]>("/api/inventory/items", { auth: "staff" }),
        apiFetch<StockCountSummaryDTO[]>("/api/inventory/counts", { auth: "staff" }),
      ]);
      setItems(i);
      setCounts(c);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the count sheet.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const lines = (items ?? []).flatMap((i) => {
    const text = entered[itemKey(i.kind, i.itemId)];
    return text !== undefined && text.trim() !== "" ? [{ kind: i.kind, itemId: i.itemId, countedQty: Number(text) }] : [];
  });
  const invalid = lines.some((l) => !(l.countedQty >= 0));

  async function save() {
    try {
      const saved = await apiFetch<StockCountDTO>("/api/inventory/counts", { method: "POST", auth: "staff", body: JSON.stringify({ note: note.trim() || undefined, lines }) });
      setResult(saved);
      setEntered({});
      setNote("");
      setConfirming(false);
      onCounted();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the count.");
      setConfirming(false);
    }
  }

  async function open(id: string) {
    try {
      setResult(await apiFetch<StockCountDTO>(`/api/inventory/counts/${id}`, { auth: "staff" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open that count.");
    }
  }

  const q = search.trim().toLowerCase();
  const shown = (items ?? []).filter((i) => q === "" || i.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-adm-ink-2 md:text-sm">
        Count what&apos;s actually there, before each market trip. Leave an item blank to skip it. The system&apos;s figure shows after saving,
        so it doesn&apos;t sway the count; saving sets the stock to what you counted.
      </p>
      {error && (
        <p role="alert" className="text-base text-adm-bad md:text-sm">
          {error}
        </p>
      )}

      {result && <CountResult count={result} isAdmin={isAdmin} onClose={() => setResult(null)} />}

      {items === null ? (
        !error && <div className="text-adm-ink-3">Loading…</div>
      ) : (
        <Card title={`Count sheet · ${lines.length} of ${items.length} counted`}>
          <div className="flex flex-col gap-3 p-4">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" aria-label="Search the count sheet" className={`sm:max-w-80 ${admInputClass}`} />
            <ul className="divide-y divide-adm-line-soft">
              {shown.map((i) => {
                const key = itemKey(i.kind, i.itemId);
                return (
                  <li key={key} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      {i.name}
                      {i.kind === "ready_made" && <span className="ml-2 text-sm text-adm-ink-3">ready-made</span>}
                    </span>
                    <div className="w-36">
                      <input
                        aria-label={`Counted ${i.name} (${i.baseUnit})`}
                        type="number"
                        min="0"
                        step={i.kind === "ready_made" ? "1" : "any"}
                        value={entered[key] ?? ""}
                        onChange={(e) => setEntered((all) => ({ ...all, [key]: e.target.value }))}
                        className={`font-adm-mono ${admInputClass}`}
                      />
                    </div>
                    <span className="w-8 text-sm text-adm-ink-3">{i.baseUnit}</span>
                  </li>
                );
              })}
            </ul>
            <label className="block">
              <span className={admLabelClass}>Note (optional)</span>
              <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Count before the Nov 29 trip" className={admInputClass} />
            </label>
            {invalid && <p className="text-base text-adm-bad md:text-sm">Counts must be 0 or more.</p>}
            <div className="flex justify-end">
              <AdmButton type="button" variant="primary" disabled={lines.length === 0 || invalid} onClick={() => setConfirming(true)}>
                Save count
              </AdmButton>
            </div>
          </div>
        </Card>
      )}

      {counts && counts.length > 0 && (
        <Card title="Past counts">
          <ul className="divide-y divide-adm-line-soft">
            {counts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  {formatDateTime(c.countedAt)} · {c.createdByName}
                  <span className="block text-sm text-adm-ink-3">
                    {c.itemCount} counted · {c.itemsOff} off
                    {isAdmin && c.totalDifferenceValue != null && ` · ${c.totalDifferenceValue < 0 ? "−" : ""}${peso(Math.abs(c.totalDifferenceValue))}`}
                  </span>
                </span>
                <AdmButton type="button" variant="secondary" size="row" onClick={() => open(c.id)}>
                  Variance
                </AdmButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Save the count of ${lines.length} item${lines.length !== 1 ? "s" : ""}?`}
          detail="Each counted item's stock is set to what you counted, logged as a correction, and the difference from the system's figure is recorded as the variance."
          confirmLabel="Yes, save count"
          onCancel={() => setConfirming(false)}
          onConfirm={save}
        />
      )}
    </div>
  );
}

function CountResult({ count, isAdmin, onClose }: { count: StockCountDTO; isAdmin: boolean; onClose: () => void }) {
  const off = count.lines.filter((l) => l.difference !== 0).length;
  return (
    <Card
      title={`Variance · counted ${formatDateTime(count.countedAt)} · ${off} of ${count.lines.length} off`}
      actions={
        <AdmButton type="button" variant="secondary" size="compact" onClick={onClose}>
          Close
        </AdmButton>
      }
    >
      {isAdmin && count.totalDifferenceValue != null && (
        <p className="px-4 pt-3 text-base md:text-sm">
          Value of the difference: <strong className={`font-adm-mono ${count.totalDifferenceValue < 0 ? "text-adm-bad" : ""}`}>{count.totalDifferenceValue < 0 ? "−" : ""}{peso(Math.abs(count.totalDifferenceValue))}</strong>
          {count.totalDifferenceValue < 0 && " missing that no sale or recorded waste explains (portioning, unrecorded waste or loss)."}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-base md:text-sm">
          <thead>
            <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-3 py-2.5 text-right font-medium">Expected</th>
              <th className="px-3 py-2.5 text-right font-medium">Counted</th>
              <th className="px-3 py-2.5 text-right font-medium">Difference</th>
              <th className="px-4 py-2.5 font-medium">Since the last count</th>
            </tr>
          </thead>
          <tbody>
            {count.lines.map((l) => (
              <tr key={itemKey(l.kind, l.itemId)} className="border-t border-adm-line-soft align-top">
                <td className="px-4 py-2.5">{l.itemName}</td>
                <td className="font-adm-mono px-3 py-2.5 text-right">{formatMaterialQty(l.systemQty, l.baseUnit)}</td>
                <td className="font-adm-mono px-3 py-2.5 text-right">{formatMaterialQty(l.countedQty, l.baseUnit)}</td>
                <td className="px-3 py-2.5 text-right">
                  {l.difference === 0 ? (
                    <StatusPill tone="ok">MATCHES</StatusPill>
                  ) : (
                    <span className={`font-adm-mono ${l.difference < 0 ? "text-adm-bad" : "text-adm-warn"}`}>
                      {l.difference > 0 ? "+" : ""}
                      {qty(l.difference)} {l.baseUnit}
                      {isAdmin && l.differenceValue != null && <span className="block text-sm">{l.differenceValue < 0 ? "−" : "+"}{peso(Math.abs(l.differenceValue))}</span>}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-sm text-adm-ink-2">
                  {l.since.previousCountedQty !== null ? `counted ${formatMaterialQty(l.since.previousCountedQty, l.baseUnit)} · ` : "first count · "}
                  bought {formatMaterialQty(l.since.purchased, l.baseUnit)} · sold {formatMaterialQty(l.since.sold, l.baseUnit)} · wasted {formatMaterialQty(l.since.wasted, l.baseUnit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
