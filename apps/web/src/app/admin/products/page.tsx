"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ProductForm } from "@/components/admin/ProductForm";
import { PageHeader, Card, AdmButton, StatusPill } from "@/components/admin/ui";
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
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow="Product catalog management"
        title="Products"
        actions={
          <>
            <Link href="/admin/import">
              <AdmButton variant="secondary">Bulk import</AdmButton>
            </Link>
            <AdmButton variant="primary" onClick={() => setEditing("new")}>
              + Add product
            </AdmButton>
          </>
        }
      />

      {message && <div className="text-sm text-adm-bad">{message}</div>}

      {loading ? (
        <div className="text-adm-ink-3">Loading…</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4.5 py-2.75 font-medium">Product</th>
                  <th className="px-3 py-2.75 font-medium">Barcode</th>
                  <th className="px-3 py-2.75 font-medium">Category</th>
                  <th className="px-3 py-2.75 text-right font-medium">Price</th>
                  <th className="px-3 py-2.75 text-right font-medium">Cost</th>
                  <th className="px-3 py-2.75 text-right font-medium">Stock</th>
                  <th className="px-3 py-2.75 font-medium">Status</th>
                  <th className="px-4.5 py-2.75 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-adm-line-soft">
                    <td className="px-4.5 py-3 font-medium">
                      {p.icon} {p.name}
                    </td>
                    <td className="font-adm-mono px-3 py-3 text-[12px] text-adm-ink-2 whitespace-nowrap">
                      {p.barcode ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-adm-ink-2 whitespace-nowrap">{p.category?.name}</td>
                    <td className="font-adm-mono px-3 py-3 text-right">₱{p.price.toFixed(2)}</td>
                    <td className="font-adm-mono px-3 py-3 text-right text-adm-ink-2">
                      {p.cost !== null ? `₱${p.cost.toFixed(2)}` : "—"}
                    </td>
                    <td className="font-adm-mono px-3 py-3 text-right">{p.stockQty ?? "—"}</td>
                    <td className="px-3 py-3">
                      <StatusPill tone={p.isAvailable ? "ok" : "bad"}>
                        {p.isAvailable ? "IN STOCK" : "SOLD OUT"}
                      </StatusPill>
                    </td>
                    <td className="px-4.5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(p)} className="mr-3 text-[12px] font-medium text-adm-accent">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(p)} className="text-[12px] font-medium text-adm-ink-3">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
