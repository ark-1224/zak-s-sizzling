"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatMaterialQty, UNIT_LABELS } from "@/lib/units";
import { RAW_MATERIAL_CATEGORIES } from "@/lib/rawMaterialCategories";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  AdmButton,
  admInputClass,
  admLabelClass,
  admModalActionsClass,
  admModalBackdropClass,
  admModalPanelClass,
} from "@/components/admin/ui";
import type { MaterialUnit, RawMaterialCategory, RawMaterialDTO } from "@zaks/shared-types";

// Add, edit or remove a raw material (Administrator only). The unit is fixed once
// created, because recipes and the movement log are written in it. Removing asks first,
// and one still in a dish's recipe can't be removed (the server refuses it too).
export function RawMaterialForm({
  material,
  onClose,
  onSaved,
  onRemoved,
}: {
  material: RawMaterialDTO | null; // null = create mode
  onClose: () => void;
  /** Called with the saved raw material; `created` is true for a new one. */
  onSaved: (saved: RawMaterialDTO, created: boolean) => void;
  /** Called once the raw material has been removed. */
  onRemoved: (removed: RawMaterialDTO) => void;
}) {
  const [name, setName] = useState(material?.name ?? "");
  const [unit, setUnit] = useState<MaterialUnit>(material?.unit ?? "g");
  const [category, setCategory] = useState<RawMaterialCategory>(material?.category ?? "others");
  const [stockQty, setStockQty] = useState("0");
  const [minStockThreshold, setMinStockThreshold] = useState(material?.minStockThreshold.toString() ?? "0");
  const [costPerUnit, setCostPerUnit] = useState(material?.costPerUnit?.toString() ?? "");
  const [isActive, setIsActive] = useState(material?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  function askToRemove() {
    if (!material) return;
    if (material.usedBy.length > 0) {
      const dishes = material.usedBy.map((u) => u.productName);
      setError(`${material.name} is in the recipe of ${dishes.join(", ")}. Take it out of ${dishes.length === 1 ? "that recipe" : "those recipes"} first (Products → Edit), or untick In use.`);
      return;
    }
    setError(null);
    setConfirmingRemove(true);
  }

  async function handleRemove() {
    if (!material) return;
    try {
      await apiFetch(`/api/raw-materials/${material.id}`, { method: "DELETE", auth: "staff" });
      onRemoved(material);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove the raw material.");
      setConfirmingRemove(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (material) {
        const saved = await apiFetch<RawMaterialDTO>(`/api/raw-materials/${material.id}`, {
          method: "PUT",
          auth: "staff",
          body: JSON.stringify({
            name,
            category,
            minStockThreshold: Number(minStockThreshold),
            costPerUnit: costPerUnit === "" ? null : Number(costPerUnit),
            isActive,
          }),
        });
        onSaved(saved, false);
      } else {
        const saved = await apiFetch<RawMaterialDTO>("/api/raw-materials", {
          method: "POST",
          auth: "staff",
          body: JSON.stringify({
            name,
            unit,
            category,
            stockQty: Number(stockQty),
            minStockThreshold: Number(minStockThreshold),
            costPerUnit: costPerUnit === "" ? undefined : Number(costPerUnit),
          }),
        });
        onSaved(saved, true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the raw material.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={admModalBackdropClass}>
      <form onSubmit={handleSubmit} className={`${admModalPanelClass} max-w-md`}>
        <div className="font-adm-mono mb-1 text-xs tracking-[.14em] text-adm-ink-3 uppercase">
          {material ? "Edit raw material" : "New raw material"}
        </div>
        <h2 className="mb-5 text-lg font-semibold tracking-tight break-words">{material ? material.name : "Add a raw material"}</h2>

        <Field label="Name">
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pork belly" className={admInputClass} />
        </Field>

        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as RawMaterialCategory)} className={admInputClass}>
            {RAW_MATERIAL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Field label="Measured in">
            {material ? (
              <input disabled value={UNIT_LABELS[material.unit]} className={`${admInputClass} opacity-70`} />
            ) : (
              <select value={unit} onChange={(e) => setUnit(e.target.value as MaterialUnit)} className={admInputClass}>
                {(Object.entries(UNIT_LABELS) as [MaterialUnit, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {!material && (
            <Field label={`Opening stock (${unit})`}>
              <input required type="number" min="0" step="any" value={stockQty} onChange={(e) => setStockQty(e.target.value)} className={`font-adm-mono ${admInputClass}`} />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Field label={`Minimum level (${material?.unit ?? unit})`}>
            <input
              required
              type="number"
              min="0"
              step="any"
              value={minStockThreshold}
              onChange={(e) => setMinStockThreshold(e.target.value)}
              className={`font-adm-mono ${admInputClass}`}
            />
          </Field>
          <Field label={`Cost per ${material?.unit ?? unit} (₱)`}>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Optional"
              value={costPerUnit}
              onChange={(e) => setCostPerUnit(e.target.value)}
              className={`font-adm-mono ${admInputClass}`}
            />
          </Field>
        </div>

        {material && (
          <label className="mb-4 flex min-h-11 items-center gap-2.5 text-base md:min-h-0 md:text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            In use (unticked materials can&apos;t be added to new recipes)
          </label>
        )}

        {error && <p className="mb-3 text-base text-adm-bad md:text-sm">{error}</p>}

        <div className={`mt-2 ${admModalActionsClass}`}>
          {material && (
            <AdmButton type="button" variant="danger" onClick={askToRemove} disabled={saving} className="sm:mr-auto">
              Remove item
            </AdmButton>
          )}
          <AdmButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdmButton>
          <AdmButton type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : material ? "Save changes" : "Add raw material"}
          </AdmButton>
        </div>
      </form>

      {confirmingRemove && material && (
        <ConfirmDialog
          title={`Remove ${material.name}?`}
          detail={`It leaves the raw materials list with its ${formatMaterialQty(material.stockQty, material.unit)} on hand, and its stock movement history is deleted too. This can't be undone. To keep the history, untick In use instead.`}
          confirmLabel="Yes, remove"
          danger
          onCancel={() => setConfirmingRemove(false)}
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className={admLabelClass}>{label}</span>
      {children}
    </label>
  );
}
