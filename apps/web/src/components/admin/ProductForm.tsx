"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { AdmButton, admInputClass, admLabelClass, admModalActionsClass, admModalBackdropClass, admModalPanelClass } from "./ui";
import { formatMaterialQty } from "@/lib/units";
import type { Category, Product, RawMaterialDTO, StockTracking } from "@zaks/shared-types";

// Add/Edit Product modal — fields match the manuscript's wireframe (name, barcode,
// category, price, stock quantity, minimum stock unit, description) plus a cost field
// for the Visual Analytics "profitability analysis per item" requirement. A product is
// either counted in units (bottled drinks) or made from a recipe of raw materials
// (sizzling plates, rice dishes); see docs/design/raw-material-stock.md.
const TRACKING_OPTIONS: [StockTracking, string][] = [
  ["unit", "Count units"],
  ["recipe", "Use a recipe"],
];

interface ProductFormProps {
  product: Product | null; // null = create mode
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

export function ProductForm({ product, categories, onClose, onSaved }: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? 0);
  const [price, setPrice] = useState(product?.price.toString() ?? "");
  const [cost, setCost] = useState(product?.cost?.toString() ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [icon, setIcon] = useState(product?.icon ?? "🍽️");
  const [stockQty, setStockQty] = useState(product?.stockQty?.toString() ?? "0");
  const [minStockThreshold, setMinStockThreshold] = useState(product?.minStockThreshold?.toString() ?? "5");
  const [tracking, setTracking] = useState<StockTracking>(product?.tracking ?? "unit");
  const [recipe, setRecipe] = useState<{ rawMaterialId: string; qty: string }[]>(
    product?.recipe?.map((r) => ({ rawMaterialId: r.rawMaterialId, qty: String(r.qtyPerServing) })) ?? []
  );
  const [materials, setMaterials] = useState<RawMaterialDTO[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justScanned, setJustScanned] = useState(false);

  useEffect(() => {
    apiFetch<RawMaterialDTO[]>("/api/raw-materials", { auth: "staff" })
      .then(setMaterials)
      .catch(() => setMaterials([]));
  }, []);

  const materialById = new Map(materials.map((m) => [m.id, m]));
  const recipeValid = recipe.length > 0 && recipe.every((r) => r.rawMaterialId && Number(r.qty) > 0);
  // Servings the current stock can make with this recipe, limited by the scarcest ingredient.
  const servingsNow = recipeValid
    ? Math.min(...recipe.map((r) => Math.floor((materialById.get(r.rawMaterialId)?.stockQty ?? 0) / Number(r.qty))))
    : null;

  function updateRecipeRow(index: number, patch: Partial<{ rawMaterialId: string; qty: string }>) {
    setRecipe((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  useBarcodeScanner((code) => {
    setBarcode(code);
    setJustScanned(true);
    setTimeout(() => setJustScanned(false), 1500);
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tracking === "recipe" && !recipeValid) {
      setError("Add at least one raw material, each with an amount per serving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name,
        barcode: barcode || undefined,
        categoryId: Number(categoryId),
        price: Number(price),
        cost: cost === "" ? undefined : Number(cost),
        description: description || undefined,
        icon: icon || undefined,
        tracking,
        ...(tracking === "unit"
          ? { stockQty: Number(stockQty), minStockThreshold: Number(minStockThreshold) }
          : { recipe: recipe.map((r) => ({ rawMaterialId: r.rawMaterialId, qtyPerServing: Number(r.qty) })) }),
      };
      if (product) {
        await apiFetch(`/api/products/${product.id}`, { method: "PUT", auth: "staff", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/products", { method: "POST", auth: "staff", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={admModalBackdropClass}>
      <form onSubmit={handleSubmit} className={`${admModalPanelClass} max-w-lg`}>
        <div className="font-adm-mono mb-1 text-xs tracking-[.14em] text-adm-ink-3 uppercase md:text-[10px]">
          {product ? "Edit product" : "New product"}
        </div>
        <h2 className="mb-5 text-lg font-semibold tracking-tight break-words">{product ? product.name : "Add a product"}</h2>

        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={admInputClass} />
        </Field>

        <Field label={`Barcode${justScanned ? " — scanned!" : ""}`}>
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan with a barcode reader, or type manually"
            className={`font-adm-mono ${admInputClass} ${justScanned ? "border-adm-ok" : ""}`}
          />
        </Field>

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Field label="Category">
            <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} className={admInputClass}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Icon (emoji)">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className={admInputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Field label="Price (₱)">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`font-adm-mono ${admInputClass}`}
            />
          </Field>
          <Field label="Cost (₱)">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Optional"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className={`font-adm-mono ${admInputClass}`}
            />
          </Field>
        </div>

        <div className="mb-3">
          <span className={admLabelClass}>How is stock counted?</span>
          <div className="flex gap-1 rounded-[6px] border border-adm-line bg-adm-bg p-1">
            {TRACKING_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTracking(value)}
                aria-pressed={tracking === value}
                className={`min-h-11 flex-1 rounded-[4px] text-base font-medium transition-colors md:min-h-0 md:py-1.5 md:text-[12.5px] ${
                  tracking === value ? "bg-adm-surface text-adm-ink shadow-sm" : "text-adm-ink-3"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tracking === "unit" ? (
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <Field label="Stock qty">
              <input
                required
                type="number"
                min="0"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className={`font-adm-mono ${admInputClass}`}
              />
            </Field>
            <Field label="Minimum level">
              <input
                required
                type="number"
                min="0"
                value={minStockThreshold}
                onChange={(e) => setMinStockThreshold(e.target.value)}
                className={`font-adm-mono ${admInputClass}`}
              />
            </Field>
          </div>
        ) : (
          <div className="mb-3 rounded-[6px] border border-adm-line-soft bg-adm-bg p-3">
            <p className="mb-2 text-base text-adm-ink-2 md:text-[12.5px]">
              Raw materials used by <strong>one serving</strong>. Paying for an order deducts these, and the dish shows as sold out
              when they can&apos;t make another serving.
            </p>
            {recipe.map((row, index) => {
              const material = materialById.get(row.rawMaterialId);
              const choices = materials.filter((m) => m.isActive || m.id === row.rawMaterialId);
              return (
                <div key={index} className="mb-2 grid grid-cols-[minmax(0,1fr)_6rem_1.75rem_auto] items-center gap-2">
                  <select
                    value={row.rawMaterialId}
                    onChange={(e) => updateRecipeRow(index, { rawMaterialId: e.target.value })}
                    aria-label={`Raw material ${index + 1}`}
                    className={`min-w-0 ${admInputClass}`}
                  >
                    <option value="">Choose…</option>
                    {choices.map((m) => (
                      <option key={m.id} value={m.id} disabled={recipe.some((r, i) => i !== index && r.rawMaterialId === m.id)}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.qty}
                    onChange={(e) => updateRecipeRow(index, { qty: e.target.value })}
                    aria-label={`Amount per serving ${index + 1}`}
                    placeholder="Amount"
                    className={`font-adm-mono min-w-0 ${admInputClass}`}
                  />
                  <span className="font-adm-mono text-sm text-adm-ink-3">{material?.unit ?? ""}</span>
                  <button
                    type="button"
                    onClick={() => setRecipe((rows) => rows.filter((_, i) => i !== index))}
                    aria-label={`Remove raw material ${index + 1}`}
                    className="h-11 w-11 rounded-[5px] border border-adm-line text-lg text-adm-ink-3 md:h-9 md:w-9"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AdmButton
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => setRecipe((rows) => [...rows, { rawMaterialId: "", qty: "" }])}
              >
                + Add raw material
              </AdmButton>
              {servingsNow !== null && (
                <span className="font-adm-mono text-sm text-adm-ink-2">
                  Current stock makes <strong className={servingsNow > 0 ? "text-adm-ok" : "text-adm-bad"}>{servingsNow}</strong>{" "}
                  serving{servingsNow !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {materials.length === 0 && (
              <p className="mt-2 text-sm text-adm-ink-3">No raw materials yet. Add them on the Raw materials page first.</p>
            )}
            {recipeValid && (
              <p className="mt-2 text-sm text-adm-ink-3">
                Per serving:{" "}
                {recipe
                  .map((r) => {
                    const m = materialById.get(r.rawMaterialId);
                    return m ? `${m.name} ${formatMaterialQty(Number(r.qty), m.unit)}` : "";
                  })
                  .join(", ")}
              </p>
            )}
          </div>
        )}

        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`h-20 resize-none py-2 ${admInputClass}`} />
        </Field>

        {error && <p className="mb-3 text-base text-adm-bad md:text-sm">{error}</p>}

        <div className={`mt-2 ${admModalActionsClass}`}>
          <AdmButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdmButton>
          <AdmButton type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </AdmButton>
        </div>
      </form>
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
