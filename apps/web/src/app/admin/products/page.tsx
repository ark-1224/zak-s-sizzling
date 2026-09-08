"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ProductForm } from "@/components/admin/ProductForm";
import type { Category, Product } from "@zaks/shared-types";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null | "new">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        apiFetch<Product[]>("/api/products"),
        apiFetch<Category[]>("/api/categories"),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(product: Product) {
    if (!confirm(`Delete "${product.name}"? This can't be undone.`)) return;
    try {
      await apiFetch(`/api/products/${product.id}`, { method: "DELETE", auth: "staff" });
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not delete the product.");
    }
  }

  return (
    <div className="min-h-screen bg-cream p-8">
      <Link href="/admin" className="mb-4 inline-block text-sm text-ink-soft">
        ← Back to dashboard
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-matcha-deep">Products</h1>
        <button
          onClick={() => setEditing("new")}
          className="rounded-full bg-matcha px-5 py-2 text-sm font-bold text-cream shadow-card"
        >
          + Add product
        </button>
      </div>

      {message && <div className="mb-4 text-sm text-berry">{message}</div>}

      {loading ? (
        <div className="text-ink-soft">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Barcode</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {p.icon} {p.name}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{p.category?.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.barcode ?? "—"}</td>
                  <td className="px-4 py-3">₱{p.price.toFixed(2)}</td>
                  <td className="px-4 py-3">{p.stockQty ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={p.isAvailable ? "text-available" : "text-berry"}>
                      {p.isAvailable ? "In stock" : "Sold out"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEditing(p)} className="mr-3 font-semibold text-matcha-deep">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(p)} className="font-semibold text-berry">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductForm
          product={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
