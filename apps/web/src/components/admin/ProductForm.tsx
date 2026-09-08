"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import type { Category, Product } from "@zaks/shared-types";

// Add/Edit Product modal — fields match the manuscript's wireframe: name, barcode,
// category, price, stock quantity, minimum stock unit, description.
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
  const [description, setDescription] = useState(product?.description ?? "");
  const [icon, setIcon] = useState(product?.icon ?? "🍽️");
  const [stockQty, setStockQty] = useState(product?.stockQty?.toString() ?? "0");
  const [minStockThreshold, setMinStockThreshold] = useState("5");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#22301f]/55 p-5">
      <form
        onSubmit={handleSubmit}
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-card bg-cream p-7 shadow-2xl"
      >
        <h2 className="font-display mb-5 text-xl font-semibold text-matcha-deep">
          {product ? "Edit product" : "Add product"}
        </h2>

        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-matcha"
          />
        </Field>

        <Field label={`Barcode${justScanned ? " — scanned!" : ""}`}>
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan with a barcode reader, or type manually"
            className={`w-full rounded-lg border bg-white px-3 py-2 outline-none focus:border-matcha ${
              justScanned ? "border-available" : "border-line"
            }`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-matcha"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Icon (emoji)">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-matcha"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Price (₱)">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-matcha"
            />
          </Field>
          <Field label="Stock qty">
            <input
              required
              type="number"
              min="0"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-matcha"
            />
          </Field>
          <Field label="Min stock">
            <input
              required
              type="number"
              min="0"
              value={minStockThreshold}
              onChange={(e) => setMinStockThreshold(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-matcha"
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-20 w-full resize-none rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-matcha"
          />
        </Field>

        {error && <p className="mb-3 text-sm text-berry">{error}</p>}

        <div className="mt-2 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-full border border-line py-2.5 font-semibold text-ink">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-full bg-matcha py-2.5 font-bold text-cream shadow-card disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
