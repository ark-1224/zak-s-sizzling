"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PageHeader, Card, AdmButton } from "@/components/admin/ui";
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
    <div className="flex flex-col gap-4.5">
      <PageHeader eyebrow="Stock adjustments" title="Inventory" />

      {message && <div className="text-sm text-adm-bad">{message}</div>}

      {lowStock.length > 0 && (
        <div className="rounded-[6px] border border-adm-warn bg-adm-warn-soft p-4">
          <div className="mb-1 font-medium text-adm-ink">
            {lowStock.length} product{lowStock.length !== 1 ? "s" : ""} at or below minimum stock
          </div>
          <div className="text-sm text-adm-ink-2">{lowStock.map((p) => p.name).join(", ")}</div>
        </div>
      )}

      {loading ? (
        <div className="text-adm-ink-3">Loading…</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4.5 py-2.75 font-medium">Product</th>
                  <th className="px-3 py-2.75 text-right font-medium">Stock</th>
                  <th className="px-3 py-2.75 text-right font-medium">Min</th>
                  <th className="px-3 py-2.75 font-medium">Adjust</th>
                  <th className="px-4.5 py-2.75 font-medium">Set exact count</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const low = lowStock.some((l) => l.id === p.id);
                  return (
                    <tr key={p.id} className="border-t border-adm-line-soft">
                      <td className="px-4.5 py-3 font-medium">
                        {p.icon} {p.name}
                      </td>
                      <td className={`font-adm-mono px-3 py-3 text-right font-bold ${low ? "text-adm-bad" : ""}`}>
                        {p.stockQty ?? 0}
                      </td>
                      <td className="font-adm-mono px-3 py-3 text-right text-adm-ink-3">{p.minStockThreshold ?? "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => adjust(p.id, -1)}
                            className="h-6.5 w-6.5 rounded-full border border-adm-line font-bold text-adm-accent"
                          >
                            −
                          </button>
                          <button
                            onClick={() => adjust(p.id, 1)}
                            className="h-6.5 w-6.5 rounded-full border border-adm-line font-bold text-adm-accent"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-4.5 py-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            value={pendingSet[p.id] ?? ""}
                            onChange={(e) => setPendingSet((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            className="font-adm-mono w-19 rounded-[5px] border border-adm-line px-2 py-1"
                          />
                          <AdmButton variant="primary" className="px-2.5 py-1.5 text-[11px]" onClick={() => setExact(p.id)}>
                            Set
                          </AdmButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
