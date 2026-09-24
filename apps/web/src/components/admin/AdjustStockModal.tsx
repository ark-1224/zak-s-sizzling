"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdmButton } from "@/components/admin/ui";
import type { AdjustmentReason, Product } from "@zaks/shared-types";

export const REASON_LABELS: Record<AdjustmentReason, string> = {
  restock: "Restock / delivery received",
  return: "Customer return",
  damaged: "Damaged goods",
  spoilage: "Spoilage",
  correction: "Manual correction (recount)",
  other: "Other",
};

const REASONS = Object.entries(REASON_LABELS) as [AdjustmentReason, string][];

// Every stock change made from this screen is logged — see the manuscript's Stock
// Adjustments feature ("Authorized users can increase or decrease stock quantities
// while maintaining a log of adjustments"). A reason is required so the audit trail
// (GET /api/inventory/adjustments) is actually explainable later, not just a number.
export function AdjustStockModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const currentQty = product.stockQty ?? 0;
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [deltaText, setDeltaText] = useState("1");
  const [setText, setSetText] = useState(String(currentQty));
  const [reason, setReason] = useState<AdjustmentReason>("correction");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const delta = Number(deltaText) || 0;
  const setQty = Number(setText);
  const newQty =
    mode === "delta" ? Math.max(0, currentQty + delta) : Number.isFinite(setQty) ? Math.max(0, setQty) : currentQty;
  const effectiveDelta = newQty - currentQty;

  function bump(amount: number) {
    setDeltaText(String((Number(deltaText) || 0) + amount));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (effectiveDelta === 0) {
      setError("That wouldn't change the stock count — nothing to save.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/inventory/${product.id}`, {
        method: "PATCH",
        auth: "staff",
        body: JSON.stringify({
          ...(mode === "delta" ? { delta } : { setQty: newQty }),
          reason,
          note: note.trim() || undefined,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the adjustment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="font-adm-sans fixed inset-0 z-50 flex items-center justify-center bg-[#141310]/45 p-5">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[8px] bg-adm-surface p-6.5 shadow-2xl">
        <div className="mb-1 text-[10.5px] tracking-[.13em] text-adm-ink-3 uppercase">Adjust stock</div>
        <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span>{product.icon}</span> {product.name}
        </h2>

        <div className="mb-4 flex gap-1 rounded-[6px] border border-adm-line bg-adm-bg p-1">
          <button
            type="button"
            onClick={() => setMode("delta")}
            className={`flex-1 rounded-[4px] py-1.5 text-[12.5px] font-medium transition-colors ${
              mode === "delta" ? "bg-adm-surface text-adm-ink shadow-sm" : "text-adm-ink-3"
            }`}
          >
            Add / remove
          </button>
          <button
            type="button"
            onClick={() => setMode("set")}
            className={`flex-1 rounded-[4px] py-1.5 text-[12.5px] font-medium transition-colors ${
              mode === "set" ? "bg-adm-surface text-adm-ink shadow-sm" : "text-adm-ink-3"
            }`}
          >
            Set exact count
          </button>
        </div>

        {mode === "delta" ? (
          <div className="mb-4">
            <span className="mb-1.5 block text-[11.5px] font-medium text-adm-ink-2">Change by</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => bump(-1)}
                className="h-9 w-9 flex-shrink-0 rounded-[5px] border border-adm-line text-base font-bold text-adm-accent"
              >
                −
              </button>
              <input
                type="number"
                value={deltaText}
                onChange={(e) => setDeltaText(e.target.value)}
                className="font-adm-mono w-full rounded-[5px] border border-adm-line bg-adm-bg px-2.75 py-2 text-center text-[15px] outline-none focus:border-adm-accent"
              />
              <button
                type="button"
                onClick={() => bump(1)}
                className="h-9 w-9 flex-shrink-0 rounded-[5px] border border-adm-line text-base font-bold text-adm-accent"
              >
                +
              </button>
            </div>
            <div className="mt-2 flex justify-center gap-1.5">
              {[-5, -1, 1, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => bump(n)}
                  className="font-adm-mono rounded-[4px] border border-adm-line px-2 py-0.5 text-[11px] text-adm-ink-2"
                >
                  {n > 0 ? `+${n}` : n}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[11.5px] font-medium text-adm-ink-2">New count</span>
            <input
              type="number"
              min="0"
              value={setText}
              onChange={(e) => setSetText(e.target.value)}
              className="font-adm-mono w-full rounded-[5px] border border-adm-line bg-adm-bg px-2.75 py-2.25 text-[13px] outline-none focus:border-adm-accent"
            />
          </label>
        )}

        <div className="mb-4 flex items-center justify-center gap-3 rounded-[6px] border border-adm-line-soft bg-adm-bg p-3">
          <span className="font-adm-mono text-[15px] text-adm-ink-3">{currentQty}</span>
          <span className="text-adm-ink-3">→</span>
          <span
            className={`font-adm-mono text-[17px] font-semibold ${
              effectiveDelta === 0 ? "text-adm-ink" : effectiveDelta > 0 ? "text-adm-ok" : "text-adm-bad"
            }`}
          >
            {newQty}
          </span>
          {effectiveDelta !== 0 && (
            <span className={`font-adm-mono text-[12px] ${effectiveDelta > 0 ? "text-adm-ok" : "text-adm-bad"}`}>
              ({effectiveDelta > 0 ? "+" : ""}
              {effectiveDelta})
            </span>
          )}
        </div>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-[11.5px] font-medium text-adm-ink-2">Reason</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as AdjustmentReason)}
            className="w-full rounded-[5px] border border-adm-line bg-adm-bg px-2.75 py-2.25 text-[13px] outline-none focus:border-adm-accent"
          >
            {REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-[11.5px] font-medium text-adm-ink-2">Note (optional)</span>
          <input
            type="text"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Recounted during closing shift"
            className="w-full rounded-[5px] border border-adm-line bg-adm-bg px-2.75 py-2.25 text-[13px] outline-none focus:border-adm-accent"
          />
        </label>

        {error && <p className="mb-3 text-sm text-adm-bad">{error}</p>}

        <div className="flex justify-end gap-2.5">
          <AdmButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdmButton>
          <AdmButton type="submit" variant="primary" disabled={saving || effectiveDelta === 0}>
            {saving ? "Saving…" : "Save adjustment"}
          </AdmButton>
        </div>
      </form>
    </div>
  );
}
