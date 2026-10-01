"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import Link from "next/link";
import { getStoredUser } from "@/lib/auth";
import { formatMaterialQty } from "@/lib/units";
import { PageHeader, Card, KpiTile, StatusPill } from "@/components/admin/ui";
import type { Product, RawMaterialDTO } from "@zaks/shared-types";

// Live stock dashboard — the admin landing page, ported from the Stock Inventory
// System UI mockup's screen 02. Replaces the old bare nav-link list now that
// AdminShell's sidebar carries navigation.
function stockLevel(p: Product): { pct: number; tone: "ok" | "warn" | "bad"; label: string } {
  const on = p.stockQty ?? 0;
  // A recipe dish's stock is the servings its raw materials can make; it runs low when
  // one of those raw materials does, which the banner above the table reports.
  if (p.tracking === "recipe") return on === 0 ? { pct: 2, tone: "bad", label: "OUT" } : { pct: 100, tone: "ok", label: "OK" };
  const min = p.minStockThreshold ?? 5;
  if (on === 0) return { pct: 2, tone: "bad", label: "OUT" };
  if (on <= min) return { pct: Math.max(8, Math.min(100, (on / (min * 2)) * 100)), tone: "warn", label: "LOW" };
  return { pct: 100, tone: "ok", label: "OK" };
}

export default function AdminDashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterialDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  // Cost figures are admin-only, like the reports they come from.
  const [isAdmin] = useState(() => getStoredUser()?.role === "admin");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, low, mats] = await Promise.all([
        apiFetch<Product[]>("/api/products", { auth: "staff" }), // cost comes back for admins only
        apiFetch<Product[]>("/api/inventory/low-stock", { auth: "staff" }),
        apiFetch<RawMaterialDTO[]>("/api/raw-materials", { auth: "staff" }),
      ]);
      setProducts(prods);
      setLowStock(low);
      setMaterials(mats);
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
  // Recipe dishes hold no stock of their own: their value is in their raw materials.
  const inventoryValueAtCost =
    products.filter((p) => p.tracking === "unit").reduce((sum, p) => sum + (p.cost ?? 0) * (p.stockQty ?? 0), 0) +
    materials.reduce((sum, m) => sum + (m.costPerUnit ?? 0) * m.stockQty, 0);
  const lowMaterials = materials.filter((m) => m.isActive && m.isLow);
  const lowCount = lowStock.length + lowMaterials.length;
  const belowMinimum = lowStock.filter((p) => (p.stockQty ?? 0) > 0).length + lowMaterials.filter((m) => m.stockQty > 0).length;

  if (loading) return <div className="text-adm-ink-3">Loading…</div>;

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader eyebrow="Realtime stock tracking" title="Live stock dashboard" />

      {message && <div className="text-sm text-adm-bad">{message}</div>}

      {lowCount > 0 && (
        <div className="flex flex-wrap items-center gap-3.5 rounded-[6px] border border-adm-warn bg-adm-warn-soft px-4 py-3.5">
          <span className="h-1.75 w-1.75 flex-shrink-0 rounded-full bg-adm-warn" />
          <div className="min-w-0 flex-1 text-base font-medium md:text-[13px]">
            {lowCount} item{lowCount !== 1 ? "s" : ""} at or below minimum stock level
            {lowMaterials.length > 0 && (
              <>
                {" "}
                ({lowMaterials.length} raw material{lowMaterials.length !== 1 ? "s" : ""},{" "}
                <Link href="/admin/raw-materials" className="underline underline-offset-2">
                  restock
                </Link>
                )
              </>
            )}
            .
          </div>
          <div className="flex w-full flex-wrap gap-1.5 md:ml-auto md:w-auto">
            {[
              ...lowStock.map((p) => ({ id: p.id, label: `${p.name.toUpperCase()} · ${p.stockQty}` })),
              ...lowMaterials.map((m) => ({ id: m.id, label: `${m.name.toUpperCase()} · ${formatMaterialQty(m.stockQty, m.unit)}` })),
            ]
              .slice(0, 4)
              .map((chip) => (
                <span key={chip.id} className="font-adm-mono rounded-[3px] border border-adm-warn px-2 py-0.75 text-xs break-words text-adm-ink-2 md:text-[11px]">
                  {chip.label}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3.5 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <KpiTile label="Active SKUs" value={String(products.length)} sub={`${categoryCount} categories`} />
        {isAdmin && (
          <KpiTile label="Inventory value" value={`₱${inventoryValueAtCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} sub="At cost" />
        )}
        <KpiTile label="Below minimum" value={String(belowMinimum)} sub="Products and raw materials" color="var(--adm-warn)" />
        <KpiTile label="Out of stock" value={String(outOfStock)} sub="Hidden from kiosk" color="var(--adm-bad)" />
      </div>

      <Card title="Current inventory levels">
        <ul className="divide-y divide-adm-line-soft md:hidden">
          {products.map((p) => {
            const level = stockLevel(p);
            const barColor = level.tone === "ok" ? "var(--adm-ok)" : level.tone === "warn" ? "var(--adm-warn)" : "var(--adm-bad)";
            return (
              <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-medium break-words">{p.name}</div>
                    <div className="text-sm text-adm-ink-2">{p.category?.name}</div>
                  </div>
                  <div className="font-adm-mono shrink-0 text-base">
                    {p.stockQty ?? 0} {p.tracking === "recipe" ? "servings" : "on hand"}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-adm-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${level.pct}%`, background: barColor }} />
                  </div>
                  <StatusPill tone={level.tone}>{level.label}</StatusPill>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto md:block">
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
                    <td className="font-adm-mono px-3 py-3 text-right whitespace-nowrap">
                      {p.stockQty ?? 0}
                      {p.tracking === "recipe" && <span className="ml-1 text-adm-ink-3">servings</span>}
                    </td>
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
