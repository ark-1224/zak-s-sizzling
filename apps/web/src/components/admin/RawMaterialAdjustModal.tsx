"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatMaterialQty } from "@/lib/units";
import { DECREASE_ONLY_MESSAGE, isDecreaseOnly, ReasonOptions } from "@/components/admin/AdjustStockModal";
import {
  AdmButton,
  admInputClass,
  admLabelClass,
  admModalActionsClass,
  admModalBackdropClass,
  admModalPanelClass,
} from "@/components/admin/ui";
import type { AdjustmentReason, RawMaterialDTO } from "@zaks/shared-types";

// Restock or correct a raw material. Same rules as product stock (AdjustStockModal):
// a reason is always required, so the movement log explains every change. Amounts are
// in the material's base unit (g, ml or pc), since that's what recipes are written in.
// The form starts with no amount and no reason, and damaged goods and spoilage can only
// lower the stock (UI review #5).
export function RawMaterialAdjustModal({
  material,
  onClose,
  onSaved,
}: {
  material: RawMaterialDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = material.stockQty;
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState<AdjustmentReason | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Number(amountText);
  const valid = amountText.trim() !== "" && Number.isFinite(amount) && amount >= 0;
  const newQty = !valid ? current : mode === "add" ? current + amount : mode === "remove" ? current - amount : amount;
  const change = newQty - current;
  const wrongDirection = isDecreaseOnly(reason) && valid && change >= 0;
  const canSave = valid && change !== 0 && newQty >= 0 && reason !== "" && !wrongDirection && !saving;

  // Adding stock can't be spoilage or damage, so switching to Add clears those reasons.
  function chooseMode(next: typeof mode) {
    setMode(next);
    if (next === "add" && isDecreaseOnly(reason)) setReason("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || change === 0) {
      setError("Enter an amount that changes the stock.");
      return;
    }
    if (newQty < 0) {
      setError(`Only ${formatMaterialQty(current, material.unit)} is in stock.`);
      return;
    }
    if (reason === "") {
      setError("Choose a reason for this change.");
      return;
    }
    if (wrongDirection) {
      setError(DECREASE_ONLY_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/raw-materials/${material.id}/stock`, {
        method: "PATCH",
        auth: "staff",
        body: JSON.stringify({
          ...(mode === "set" ? { setQty: amount } : { delta: mode === "add" ? amount : -amount }),
          reason,
          note: note.trim() || undefined,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the change.");
    } finally {
      setSaving(false);
    }
  }

  const modes: [typeof mode, string][] = [
    ["add", "Add (restock)"],
    ["remove", "Remove"],
    ["set", "Set exact amount"],
  ];

  return (
    <div className={admModalBackdropClass}>
      <form onSubmit={handleSubmit} className={`${admModalPanelClass} max-w-md`}>
        <div className="mb-1 text-xs tracking-[.13em] text-adm-ink-3 uppercase md:text-[10.5px]">Adjust raw material</div>
        <h2 className="mb-5 text-lg font-semibold tracking-tight break-words">{material.name}</h2>

        <div className="mb-4 flex gap-1 rounded-[6px] border border-adm-line bg-adm-bg p-1">
          {modes.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => chooseMode(value)}
              className={`min-h-11 flex-1 rounded-[4px] text-base font-medium transition-colors md:min-h-0 md:py-1.5 md:text-[12.5px] ${
                mode === value ? "bg-adm-surface text-adm-ink shadow-sm" : "text-adm-ink-3"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mb-4 block">
          <span className={admLabelClass}>
            {mode === "set" ? "Amount counted" : "Amount"} ({material.unit})
          </span>
          <input
            type="number"
            min="0"
            step="any"
            required
            autoFocus
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder={material.unit === "pc" ? "e.g. 24" : "e.g. 2500"}
            className={`font-adm-mono ${admInputClass}`}
          />
        </label>

        <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-[6px] border border-adm-line-soft bg-adm-bg p-3">
          <span className="font-adm-mono text-[15px] text-adm-ink-3">{formatMaterialQty(current, material.unit)}</span>
          <span className="text-adm-ink-3">→</span>
          <span
            className={`font-adm-mono text-[17px] font-semibold ${
              newQty < 0 ? "text-adm-bad" : change === 0 ? "text-adm-ink" : change > 0 ? "text-adm-ok" : "text-adm-bad"
            }`}
          >
            {formatMaterialQty(newQty, material.unit)}
          </span>
        </div>

        <label className="mb-3 block">
          <span className={admLabelClass}>Reason</span>
          <select value={reason} required onChange={(e) => setReason(e.target.value as AdjustmentReason)} className={admInputClass}>
            <ReasonOptions disableDecreaseOnly={mode === "add"} />
          </select>
          {wrongDirection && (
            <span role="alert" className="mt-1.5 block text-base text-adm-bad md:text-[12px]">
              {DECREASE_ONLY_MESSAGE} Enter a lower amount.
            </span>
          )}
        </label>

        <label className="mb-4 block">
          <span className={admLabelClass}>Note (optional)</span>
          <input
            type="text"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Delivery from the supplier"
            className={admInputClass}
          />
        </label>

        {error && <p className="mb-3 text-base text-adm-bad md:text-sm">{error}</p>}

        <div className={admModalActionsClass}>
          <AdmButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdmButton>
          <AdmButton type="submit" variant="primary" disabled={!canSave}>
            {saving ? "Saving…" : "Save change"}
          </AdmButton>
        </div>
      </form>
    </div>
  );
}
