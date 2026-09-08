"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { Product } from "@zaks/shared-types";

// Stock table + low-stock banner + adjustment tools, per the manuscript's Realtime
// Stock Tracking and Stock Adjustments features. Adjustments here call
// PATCH /api/inventory/:productId, which broadcasts inventory:updated over
// WebSockets — the kiosk grid updates live, with no refresh needed.
export default function AdminInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingSet, setPendingSet] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, low] = await Promise.all([
        apiFetch<Product[]>("/api/products"),
        apiFetch<Product[]>("/api/inventory/low-stock", { auth: "staff" }),
      ]);
      setProducts(prods);
      setLowStock(low);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not load inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function adjust(productId: string, delta: number) {
    try {
      await apiFetch(`/api/inventory/${productId}`, {
        method: "PATCH",
        auth: "staff",
        body: JSON.stringify({ delta }),
      });
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not adjust stock.");
    }
  }

  async function setExact(productId: string) {
    const value = pendingSet[productId];
    if (value === undefined || value === "") return;
    try {
      await apiFetch(`/api/inventory/${productId}`, {
        method: "PATCH",
        auth: "staff",
        body: JSON.stringify({ setQty: Number(value) }),
      });
      setPendingSet((prev) => ({ ...prev, [productId]: "" }));
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not set stock.");
    }
  }

  return (
    <div className="min-h-screen bg-cream p-8">
      <Link href="/admin" className="mb-4 inline-block text-sm text-ink-soft">
        ← Back to dashboard
      </Link>
      <h1 className="font-display mb-6 text-2xl font-semibold text-matcha-deep">Inventory</h1>

      {message && <div className="mb-4 text-sm text-berry">{message}</div>}

      {lowStock.length > 0 && (
        <div className="mb-6 rounded-xl border border-berry/30 bg-berry/8 p-4">
          <div className="mb-1 font-semibold text-berry">
            {lowStock.length} product{lowStock.length !== 1 ? "s" : ""} at or below minimum stock
          </div>
          <div className="text-sm text-ink-soft">{lowStock.map((p) => p.name).join(", ")}</div>
        </div>
      )}

      {loading ? (
        <div className="text-ink-soft">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Adjust</th>
                <th className="px-4 py-3">Set exact count</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const low = lowStock.some((l) => l.id === p.id);
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {p.icon} {p.name}
                    </td>
                    <td className={`px-4 py-3 font-bold ${low ? "text-berry" : ""}`}>{p.stockQty ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => adjust(p.id, -1)}
                          className="h-7 w-7 rounded-full border border-line font-bold text-matcha-deep"
                        >
                          −
                        </button>
                        <button
                          onClick={() => adjust(p.id, 1)}
                          className="h-7 w-7 rounded-full border border-line font-bold text-matcha-deep"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={pendingSet[p.id] ?? ""}
                          onChange={(e) => setPendingSet((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-20 rounded-lg border border-line px-2 py-1"
                        />
                        <button
                          onClick={() => setExact(p.id)}
                          className="rounded-lg bg-matcha px-3 py-1 text-xs font-bold text-cream"
                        >
                          Set
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
