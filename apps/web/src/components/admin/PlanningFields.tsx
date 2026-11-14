"use client";

import { AdmButton, admInputClass, admLabelClass } from "@/components/admin/ui";
import type { MaterialUnit, StockPlanning, StorageType } from "@zaks/shared-types";

// The market-trip fields of a raw material or ready-made item's form: the units it's
// bought in at the palengke (unit conversion, "1 tray = 30 pc"), par level and safety
// stock for the shopping list, and how it's stored and for how many days it stays fresh.
// Amounts are in the item's base unit (g, ml or pieces).

export const STORAGE_LABELS: Record<StorageType, string> = { frozen: "Frozen (freezer)", chilled: "Chilled (refrigerator)", room: "Room temperature" };

export interface PlanningState {
  parLevel: string;
  safetyStock: string;
  storage: StorageType | "";
  shelfLifeDays: string;
  units: { name: string; qtyInBase: string }[];
}

export function planningState(p: StockPlanning | null | undefined): PlanningState {
  return {
    parLevel: p?.parLevel?.toString() ?? "",
    safetyStock: p?.safetyStock?.toString() ?? "",
    storage: p?.storage ?? "",
    shelfLifeDays: p?.shelfLifeDays?.toString() ?? "",
    units: (p?.purchaseUnits ?? []).map((u) => ({ name: u.name, qtyInBase: u.qtyInBase.toString() })),
  };
}

/** The payload for the API, or an error message for the form. */
export function planningPayload(s: PlanningState, wholePieces: boolean):
  | { ok: true; value: { parLevel: number | null; safetyStock: number | null; storage: StorageType | null; shelfLifeDays: number | null; purchaseUnits: { name: string; qtyInBase: number }[] } }
  | { ok: false; error: string } {
  const amount = (text: string, label: string) => {
    if (text.trim() === "") return { value: null as number | null };
    const n = Number(text);
    if (!(n >= 0)) return { error: `${label}: enter 0 or more, or leave it blank.` };
    if (wholePieces && !Number.isInteger(n)) return { error: `${label} is in whole pieces.` };
    return { value: n };
  };
  const par = amount(s.parLevel, "Par level");
  if ("error" in par) return { ok: false, error: par.error! };
  const safety = amount(s.safetyStock, "Safety stock");
  if ("error" in safety) return { ok: false, error: safety.error! };
  if (par.value !== null && safety.value !== null && safety.value > par.value) return { ok: false, error: "The safety stock can't be more than the par level." };
  let shelf: number | null = null;
  if (s.shelfLifeDays.trim() !== "") {
    shelf = Number(s.shelfLifeDays);
    if (!Number.isInteger(shelf) || shelf < 1) return { ok: false, error: "Days fresh: enter whole days (1 or more), or leave it blank." };
  }
  const units = [];
  for (const u of s.units) {
    if (u.name.trim() === "" && u.qtyInBase.trim() === "") continue;
    const size = Number(u.qtyInBase);
    if (u.name.trim() === "") return { ok: false, error: "Name each market unit (kg, tray, sack…)." };
    if (!(size > 0)) return { ok: false, error: `Say how much one ${u.name.trim()} is.` };
    units.push({ name: u.name.trim(), qtyInBase: size });
  }
  return { ok: true, value: { parLevel: par.value, safetyStock: safety.value, storage: s.storage || null, shelfLifeDays: shelf, purchaseUnits: units } };
}

export function PlanningFields({ baseUnit, value, onChange }: { baseUnit: MaterialUnit; value: PlanningState; onChange: (next: PlanningState) => void }) {
  const set = (patch: Partial<PlanningState>) => onChange({ ...value, ...patch });
  const setUnit = (i: number, patch: Partial<PlanningState["units"][number]>) =>
    set({ units: value.units.map((u, j) => (j === i ? { ...u, ...patch } : u)) });

  return (
    <fieldset className="mb-3 rounded-[6px] border border-adm-line-soft p-3">
      <legend className="px-1 text-sm font-semibold text-adm-ink-2">Market trip</legend>

      <span className={admLabelClass}>Bought at the market in</span>
      <ul className="mb-2 flex flex-col gap-2">
        {value.units.map((u, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-adm-ink-3">1</span>
            <div className="w-28 shrink-0">
              <input
                aria-label="Market unit name"
                value={u.name}
                maxLength={40}
                placeholder="kg, tray, sack…"
                onChange={(e) => setUnit(i, { name: e.target.value })}
                className={admInputClass}
              />
            </div>
            <span className="text-sm text-adm-ink-3">=</span>
            <div className="w-28 shrink-0">
              <input
                aria-label={`How many ${baseUnit} in one ${u.name || "unit"}`}
                type="number"
                min="0"
                step="any"
                value={u.qtyInBase}
                onChange={(e) => setUnit(i, { qtyInBase: e.target.value })}
                className={`font-adm-mono ${admInputClass}`}
              />
            </div>
            <span className="text-sm text-adm-ink-3">{baseUnit}</span>
            <AdmButton type="button" variant="secondary" size="compact" aria-label={`Remove ${u.name || "unit"}`} onClick={() => set({ units: value.units.filter((_, j) => j !== i) })}>
              ×
            </AdmButton>
          </li>
        ))}
      </ul>
      <AdmButton type="button" variant="secondary" size="compact" className="mb-3" onClick={() => set({ units: [...value.units, { name: "", qtyInBase: "" }] })}>
        + Add a market unit
      </AdmButton>

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <label className="mb-3 block">
          <span className={admLabelClass}>Par level ({baseUnit})</span>
          <input type="number" min="0" step="any" placeholder="Most to keep" value={value.parLevel} onChange={(e) => set({ parLevel: e.target.value })} className={`font-adm-mono ${admInputClass}`} />
        </label>
        <label className="mb-3 block">
          <span className={admLabelClass}>Safety stock ({baseUnit})</span>
          <input type="number" min="0" step="any" placeholder="Buffer to keep" value={value.safetyStock} onChange={(e) => set({ safetyStock: e.target.value })} className={`font-adm-mono ${admInputClass}`} />
        </label>
        <label className="mb-1 block">
          <span className={admLabelClass}>Stored</span>
          <select value={value.storage} onChange={(e) => set({ storage: e.target.value as StorageType | "" })} className={admInputClass}>
            <option value="">Not set</option>
            {(Object.entries(STORAGE_LABELS) as [StorageType, string][]).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-1 block">
          <span className={admLabelClass}>Days it stays fresh</span>
          <input type="number" min="1" step="1" placeholder="No warning" value={value.shelfLifeDays} onChange={(e) => set({ shelfLifeDays: e.target.value })} className={`font-adm-mono ${admInputClass}`} />
        </label>
      </div>
      <p className="mt-2 text-sm text-adm-ink-3">
        The shopping list buys enough until the next trip plus the safety stock, never above the par level. Days fresh count from the purchase date.
      </p>
    </fieldset>
  );
}
