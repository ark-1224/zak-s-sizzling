"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getSocket } from "@/lib/websocket";
import { PageHeader, Card, AdmButton } from "@/components/admin/ui";
import { AdjustStockModal, REASON_LABELS } from "@/components/admin/AdjustStockModal";
import type { Product, StockAdjustmentDTO } from "@zaks/shared-types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Stock table + low-stock banner + adjustment tool, per the manuscript's Realtime
// Stock Tracking and Stock Adjustments features. Every adjustment here is made
// through AdjustStockModal, which requires a reason — that's what makes the "Recent
// adjustments" log below more than just a number changing: it's who changed it, by
// how much, and why, which the manuscript's Stock Adjustments feature explicitly asks
// for ("maintaining a log of adjustments").
export default function AdminInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustmentDTO[]>([]);
  const [logProductId, setLogProductId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);

  const loadLog = useCallback(async (productId: string) => {
    try {
      const query = productId === "all" ? "" : `?productId=${productId}`;
      setAdjustments(await apiFetch<StockAdjustmentDTO[]>(`/api/inventory/adjustments${query}`, { auth: "staff" }));
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not load the adjustment log.");
    }
  }, []);

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
    loadLog("all");
  }, [load, loadLog]);

  useEffect(() => {
    loadLog(logProductId);
  }, [logProductId, loadLog]);

  // Live-refresh the log if another admin/staff session adjusts stock — reuses the
  // existing public inventory:updated broadcast just as a "something changed" signal
  // rather than putting adjuster names/notes on the wire to every connected client
  // (including anonymous kiosk sessions).
  useEffect(() => {
    const socket = getSocket();
    function handleUpdate() {
      loadLog(logProductId);
    }
    socket.on("inventory:updated", handleUpdate);
    return () => {
      socket.off("inventory:updated", handleUpdate);
    };
  }, [logProductId, loadLog]);

  async function handleSaved() {
    setAdjustingProduct(null);
    await Promise.all([load(), loadLog(logProductId)]);
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
                  <th className="px-4.5 py-2.75 text-right font-medium">Actions</th>
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
                      <td className="px-4.5 py-3 text-right">
                        <AdmButton
                          variant="secondary"
                          className="px-2.75 py-1.5 text-[11.5px]"
                          onClick={() => setAdjustingProduct(p)}
                        >
                          Adjust
                        </AdmButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card
        title="Recent adjustments"
        actions={
          <select
            value={logProductId}
            onChange={(e) => setLogProductId(e.target.value)}
            className="rounded-[4px] border border-adm-line bg-adm-surface px-2 py-1 text-[11.5px]"
          >
            <option value="all">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      >
        {adjustments.length === 0 ? (
          <div className="p-4 text-sm text-adm-ink-3">No manual stock adjustments recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4.5 py-2.75 font-medium">When</th>
                  <th className="px-3 py-2.75 font-medium">Product</th>
                  <th className="px-3 py-2.75 text-right font-medium">Change</th>
                  <th className="px-3 py-2.75 font-medium">Reason</th>
                  <th className="px-3 py-2.75 font-medium">Note</th>
                  <th className="px-4.5 py-2.75 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id} className="border-t border-adm-line-soft">
                    <td className="font-adm-mono px-4.5 py-2.75 whitespace-nowrap text-adm-ink-3">{formatTime(a.createdAt)}</td>
                    <td className="px-3 py-2.75">
                      {a.productIcon} {a.productName}
                    </td>
                    <td className="font-adm-mono px-3 py-2.75 text-right whitespace-nowrap">
                      <span className={a.delta > 0 ? "text-adm-ok" : "text-adm-bad"}>
                        {a.delta > 0 ? "+" : ""}
                        {a.delta}
                      </span>
                      <span className="ml-1.5 text-adm-ink-3">
                        ({a.previousQty}→{a.newQty})
                      </span>
                    </td>
                    <td className="px-3 py-2.75 text-adm-ink-2">{REASON_LABELS[a.reason]}</td>
                    <td className="max-w-50 truncate px-3 py-2.75 text-adm-ink-3" title={a.note ?? undefined}>
                      {a.note ?? "—"}
                    </td>
                    <td className="px-4.5 py-2.75 text-adm-ink-2">{a.adjustedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adjustingProduct && (
        <AdjustStockModal product={adjustingProduct} onClose={() => setAdjustingProduct(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}
