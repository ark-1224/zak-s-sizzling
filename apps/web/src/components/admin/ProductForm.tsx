"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { AdmButton, admInputClass, admLabelClass, admModalActionsClass, admModalBackdropClass, admModalPanelClass } from "./ui";
import type { Category, Product } from "@zaks/shared-types";

// Add/Edit Product modal — fields match the manuscript's wireframe (name, barcode,
// category, price, stock quantity, minimum stock unit, description) plus a cost field
// for the Visual Analytics "profitability analysis per item" requirement.
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justScanned, setJustScanned] = useState(false);

  useBarcodeScanner((code) => {
    setBarcode(code);
    setJustScanned(true);
    setTimeout(() => setJustScanned(false), 1500);
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        stockQty: Number(stockQty),
        minStockThreshold: Number(minStockThreshold),
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
