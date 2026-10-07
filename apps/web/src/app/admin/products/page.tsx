"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ProductForm } from "@/components/admin/ProductForm";
import { PageHeader, Card, AdmButton, StatusPill, admButtonClass, admInputClass } from "@/components/admin/ui";
import type { Category, Product } from "@zaks/shared-types";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        apiFetch<Product[]>("/api/products", { auth: "staff" }), // the admin token unlocks cost
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

  // Search by name, barcode or category, ignoring case, narrowed by the category
  // dropdown; the two work together (UI review #16).
  const search = query.trim().toLowerCase();
  const filtering = Boolean(search) || categoryFilter !== "all";
  const shown = products.filter(
    (p) =>
      (categoryFilter === "all" || p.categoryId === categoryFilter) &&
      (!search || [p.name, p.barcode ?? "", p.category?.name ?? ""].some((field) => field.toLowerCase().includes(search)))
  );
  const countIn = (categoryId: number) => products.filter((p) => p.categoryId === categoryId).length;
  const filterLabel = [
    search && `match “${query.trim()}”`,
    categoryFilter !== "all" && `in ${categories.find((c) => c.id === categoryFilter)?.name ?? "this category"}`,
  ]
    .filter(Boolean)
    .join(" ");

  function clearFilters() {
    setQuery("");
    setCategoryFilter("all");
  }

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow="Product catalog management"
        title="Products"
        actions={
          <>
            <Link href="/admin/import" className={admButtonClass({ variant: "secondary" })}>
              Bulk import
            </Link>
            <AdmButton variant="primary" onClick={() => setEditing("new")}>
              + Add product
            </AdmButton>
          </>
        }
      />

      {message && <div className="text-base text-adm-bad md:text-sm">{message}</div>}

      {!loading && products.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, barcode or category"
            aria-label="Search products by name, barcode or category"
            className={`sm:max-w-96 ${admInputClass}`}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            aria-label="Filter products by category"
            className={`sm:max-w-60 ${admInputClass}`}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({countIn(c.id)})
              </option>
            ))}
          </select>
          <span className="text-sm text-adm-ink-3" aria-live="polite">
            {filtering ? `${shown.length} of ${products.length} products` : `${products.length} products`}
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-adm-ink-3">Loading…</div>
      ) : filtering && shown.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-adm-ink-3">
          No products {filterLabel}.
          <AdmButton variant="secondary" size="compact" onClick={clearFilters}>
            {search && categoryFilter !== "all" ? "Clear search and filter" : search ? "Clear search" : "Show all categories"}
          </AdmButton>
        </div>
      ) : (
        <Card>
          <ul className="divide-y divide-adm-line-soft md:hidden">
            {shown.map((p) => (
              <li key={p.id} className="flex flex-col gap-2.5 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-base font-medium break-words">
                    {p.icon} {p.name}
                  </div>
                  <StatusPill tone={p.isAvailable ? "ok" : "bad"}>{p.isAvailable ? "IN STOCK" : "SOLD OUT"}</StatusPill>
                </div>
                <dl className="grid grid-cols-2 items-baseline gap-x-3 gap-y-1 text-base">
                  <dt className="text-sm text-adm-ink-3">Category</dt>
                  <dd className="min-w-0 break-words text-adm-ink-2">{p.category?.name}</dd>
                  <dt className="text-sm text-adm-ink-3">Price</dt>
                  <dd className="font-adm-mono">₱{p.price.toFixed(2)}</dd>
                  <dt className="text-sm text-adm-ink-3">Cost</dt>
                  <dd className="font-adm-mono text-adm-ink-2">{p.cost != null ? `₱${p.cost.toFixed(2)}` : "—"}</dd>
                  <dt className="text-sm text-adm-ink-3">Stock</dt>
                  <dd className="font-adm-mono">{p.stockQty ?? "—"}</dd>
                  <dt className="text-sm text-adm-ink-3">Barcode</dt>
                  <dd className="font-adm-mono min-w-0 break-all text-adm-ink-2">{p.barcode ?? "—"}</dd>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  <AdmButton variant="secondary" onClick={() => setEditing(p)}>
                    Edit
                  </AdmButton>
                  <AdmButton variant="danger" onClick={() => handleDelete(p)}>
                    Delete
                  </AdmButton>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
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
                {shown.map((p) => (
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
                      {p.cost != null ? `₱${p.cost.toFixed(2)}` : "—"}
                    </td>
                    <td className="font-adm-mono px-3 py-3 text-right">{p.stockQty ?? "—"}</td>
                    <td className="px-3 py-3">
                      <StatusPill tone={p.isAvailable ? "ok" : "bad"}>
                        {p.isAvailable ? "IN STOCK" : "SOLD OUT"}
                      </StatusPill>
                    </td>
                    <td className="px-4.5 py-2 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <AdmButton variant="secondary" size="row" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                          Edit
                        </AdmButton>
                        <AdmButton variant="danger" size="row" onClick={() => handleDelete(p)} aria-label={`Delete ${p.name}`}>
                          Delete
                        </AdmButton>
                      </div>
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
