"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  // loadLog is triggered from several independent places (dropdown change, the
  // inventory:updated socket handler, initial mount, post-save refresh) with no
  // guarantee they resolve in the order they fired — switching the product filter
  // quickly could let an older selection's response land after a newer one and
  // overwrite it. A per-call request id (not a single effect-scoped `cancelled` flag,
  // since there's no one effect that owns every call site here) makes only the most
  // recently *initiated* call's result ever get applied.
  const loadLogRequestId = useRef(0);

  const loadLog = useCallback(async (productId: string) => {
    const requestId = ++loadLogRequestId.current;
    try {
      const query = productId === "all" ? "" : `?productId=${productId}`;
      const result = await apiFetch<StockAdjustmentDTO[]>(`/api/inventory/adjustments${query}`, { auth: "staff" });
      if (requestId !== loadLogRequestId.current) return;
      setAdjustments(result);
    } catch (err) {
      if (requestId !== loadLogRequestId.current) return;
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

      {message && <div className="text-base text-adm-bad md:text-sm">{message}</div>}

      {lowStock.length > 0 && (
        <div className="rounded-[6px] border border-adm-warn bg-adm-warn-soft p-4">
          <div className="mb-1 font-medium text-adm-ink">
            {lowStock.length} product{lowStock.length !== 1 ? "s" : ""} at or below minimum stock
          </div>
          <div className="text-base break-words text-adm-ink-2 md:text-sm">{lowStock.map((p) => p.name).join(", ")}</div>
        </div>
      )}

      {loading ? (
        <div className="text-adm-ink-3">Loading…</div>
      ) : (
        <Card>
          <ul className="divide-y divide-adm-line-soft md:hidden">
            {products.map((p) => {
              const low = lowStock.some((l) => l.id === p.id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-base font-medium break-words">
                      {p.icon} {p.name}
                    </div>
                    <div className="font-adm-mono text-sm text-adm-ink-3">
                      <span className={`font-bold ${low ? "text-adm-bad" : "text-adm-ink"}`}>{p.stockQty ?? 0}</span> in stock · min{" "}
                      {p.minStockThreshold ?? "—"}
                    </div>
                  </div>
                  <AdmButton variant="secondary" className="shrink-0" onClick={() => setAdjustingProduct(p)}>
                    Adjust
                  </AdmButton>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
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
                        <AdmButton variant="secondary" size="compact" onClick={() => setAdjustingProduct(p)}>
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
            aria-label="Filter adjustments by product"
            className="min-h-11 w-full min-w-0 rounded-[4px] border border-adm-line bg-adm-surface px-2 text-base md:min-h-0 md:w-auto md:py-1 md:text-[11.5px]"
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
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">No manual stock adjustments recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base md:text-sm">
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
