"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  AdmButton,
  admInputClass,
  admLabelClass,
  admModalActionsClass,
  admModalBackdropClass,
  admModalPanelClass,
} from "@/components/admin/ui";
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
    <div className={admModalBackdropClass}>
      <form onSubmit={handleSubmit} className={`${admModalPanelClass} max-w-md`}>
        <div className="mb-1 text-xs tracking-[.13em] text-adm-ink-3 uppercase md:text-[10.5px]">Adjust stock</div>
        <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span>{product.icon}</span> <span className="min-w-0 break-words">{product.name}</span>
        </h2>

        <div className="mb-4 flex gap-1 rounded-[6px] border border-adm-line bg-adm-bg p-1">
          <button
            type="button"
            onClick={() => setMode("delta")}
            className={`min-h-11 flex-1 rounded-[4px] text-base font-medium transition-colors md:min-h-0 md:py-1.5 md:text-[12.5px] ${
              mode === "delta" ? "bg-adm-surface text-adm-ink shadow-sm" : "text-adm-ink-3"
            }`}
          >
            Add / remove
          </button>
          <button
            type="button"
            onClick={() => setMode("set")}
            className={`min-h-11 flex-1 rounded-[4px] text-base font-medium transition-colors md:min-h-0 md:py-1.5 md:text-[12.5px] ${
              mode === "set" ? "bg-adm-surface text-adm-ink shadow-sm" : "text-adm-ink-3"
            }`}
          >
            Set exact count
          </button>
        </div>

        {mode === "delta" ? (
          <div className="mb-4">
            <span className={admLabelClass}>Change by</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => bump(-1)}
                aria-label="Decrease by 1"
                className="h-11 w-11 flex-shrink-0 rounded-[5px] border border-adm-line text-lg font-bold text-adm-accent md:h-9 md:w-9 md:text-base"
              >
                −
              </button>
              <input
                type="number"
                value={deltaText}
                onChange={(e) => setDeltaText(e.target.value)}
                aria-label="Change by"
                className={`font-adm-mono text-center ${admInputClass}`}
              />
              <button
                type="button"
                onClick={() => bump(1)}
                aria-label="Increase by 1"
                className="h-11 w-11 flex-shrink-0 rounded-[5px] border border-adm-line text-lg font-bold text-adm-accent md:h-9 md:w-9 md:text-base"
              >
                +
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5 md:flex md:justify-center">
              {[-5, -1, 1, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => bump(n)}
                  className="font-adm-mono min-h-11 rounded-[4px] border border-adm-line text-base text-adm-ink-2 md:min-h-0 md:px-2 md:py-0.5 md:text-[11px]"
                >
                  {n > 0 ? `+${n}` : n}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <label className="mb-4 block">
            <span className={admLabelClass}>New count</span>
            <input
              type="number"
              min="0"
              value={setText}
              onChange={(e) => setSetText(e.target.value)}
              className={`font-adm-mono ${admInputClass}`}
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
          <span className={admLabelClass}>Reason</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as AdjustmentReason)}
            className={admInputClass}
          >
            {REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-4 block">
          <span className={admLabelClass}>Note (optional)</span>
          <input
            type="text"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Recounted during closing shift"
            className={admInputClass}
          />
        </label>

        {error && <p className="mb-3 text-base text-adm-bad md:text-sm">{error}</p>}

        <div className={admModalActionsClass}>
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
