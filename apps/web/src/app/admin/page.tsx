"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PageHeader, Card, KpiTile, StatusPill } from "@/components/admin/ui";
import type { Product } from "@zaks/shared-types";

// Live stock dashboard — the admin landing page, ported from the Stock Inventory
// System UI mockup's screen 02. Replaces the old bare nav-link list now that
// AdminShell's sidebar carries navigation.
function stockLevel(p: Product): { pct: number; tone: "ok" | "warn" | "bad"; label: string } {
  const on = p.stockQty ?? 0;
  const min = p.minStockThreshold ?? 5;
  if (on === 0) return { pct: 2, tone: "bad", label: "OUT" };
  if (on <= min) return { pct: Math.max(8, Math.min(100, (on / (min * 2)) * 100)), tone: "warn", label: "LOW" };
  return { pct: 100, tone: "ok", label: "OK" };
}

export default function AdminDashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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
      setMessage(err instanceof ApiError ? err.message : "Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categoryCount = new Set(products.map((p) => p.categoryId)).size;
  const outOfStock = products.filter((p) => (p.stockQty ?? 0) === 0).length;
  const inventoryValueAtCost = products.reduce((sum, p) => sum + (p.cost ?? 0) * (p.stockQty ?? 0), 0);

  if (loading) return <div className="text-adm-ink-3">Loading…</div>;

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader eyebrow="Realtime stock tracking" title="Live stock dashboard" />

      {message && <div className="text-sm text-adm-bad">{message}</div>}

      {lowStock.length > 0 && (
        <div className="flex flex-wrap items-center gap-3.5 rounded-[6px] border border-adm-warn bg-adm-warn-soft px-4 py-3.5">
          <span className="h-1.75 w-1.75 flex-shrink-0 rounded-full bg-adm-warn" />
          <div className="text-[13px] font-medium">
            {lowStock.length} product{lowStock.length !== 1 ? "s" : ""} at or below minimum stock level.
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {lowStock.slice(0, 4).map((p) => (
              <span key={p.id} className="font-adm-mono rounded-[3px] border border-adm-warn px-2 py-0.75 text-[11px] text-adm-ink-2">
                {p.name.toUpperCase()} · {p.stockQty}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <KpiTile label="Active SKUs" value={String(products.length)} sub={`${categoryCount} categories`} />
        <KpiTile label="Inventory value" value={`₱${inventoryValueAtCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} sub="At cost" />
        <KpiTile label="Below minimum" value={String(lowStock.filter((p) => (p.stockQty ?? 0) > 0).length)} sub="Reorder soon" color="var(--adm-warn)" />
        <KpiTile label="Out of stock" value={String(outOfStock)} sub="Hidden from kiosk" color="var(--adm-bad)" />
      </div>

      <Card title="Current inventory levels">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                <th className="px-4.5 py-2.75 font-medium">Product</th>
                <th className="px-3 py-2.75 font-medium">Category</th>
                <th className="px-3 py-2.75 text-right font-medium">On hand</th>
                <th className="w-45 px-4.5 py-2.75 font-medium">Level</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const level = stockLevel(p);
                const barColor = level.tone === "ok" ? "var(--adm-ok)" : level.tone === "warn" ? "var(--adm-warn)" : "var(--adm-bad)";
                return (
                  <tr key={p.id} className="border-t border-adm-line-soft">
                    <td className="px-4.5 py-3">
                      <div className="font-medium">{p.name}</div>
                      {p.barcode && <div className="font-adm-mono mt-0.5 text-[10.5px] text-adm-ink-3">{p.barcode}</div>}
                    </td>
                    <td className="px-3 py-3 text-adm-ink-2 whitespace-nowrap">{p.category?.name}</td>
                    <td className="font-adm-mono px-3 py-3 text-right">{p.stockQty ?? 0}</td>
                    <td className="px-4.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.25 min-w-15 flex-1 overflow-hidden rounded-full bg-adm-surface-2">
                          <div className="h-full rounded-full" style={{ width: `${level.pct}%`, background: barColor }} />
                        </div>
                        <StatusPill tone={level.tone}>{level.label}</StatusPill>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
