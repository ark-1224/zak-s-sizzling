"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import Link from "next/link";
import { getStoredUser } from "@/lib/auth";
import { PageHeader, Card, KpiTile, StatusPill, admButtonClass } from "@/components/admin/ui";
import type { Product, RawMaterialDTO } from "@zaks/shared-types";

// Live stock dashboard — the admin landing page, ported from the Stock Inventory
// System UI mockup's screen 02. Every dish is made from a bill of materials (panel
// feedback), so stock is counted in raw materials, plus the ready-made items (bottled
// drinks, counted in pieces). The low-stock notice and the Needs restock / Out of stock
// tiles count both, and each links to the Raw materials page already filtered to them.
// The table shows the servings each dish's recipe can still make, or a ready-made
// item's pieces.
const isReadyMade = (p: Product) => p.category?.isReadyMade === true;

function stockLevel(p: Product): { pct: number; tone: "ok" | "warn" | "bad"; label: string } {
  const qty = p.stockQty ?? 0;
  if (qty <= 0) return { pct: 2, tone: "bad", label: "OUT" };
  // A ready-made item has its own minimum. A dish runs low when one of its raw materials
  // does, which the notice above reports.
  if (isReadyMade(p) && qty <= (p.minStockThreshold ?? 0)) return { pct: 35, tone: "warn", label: "LOW" };
  return { pct: 100, tone: "ok", label: "OK" };
}

/** The Raw materials page filtered to `filter`, on the Ready-made tab when only ready-made items match. */
function stockHref(filter: "low" | "out", materialCount: number, readyMadeCount: number) {
  return materialCount === 0 && readyMadeCount > 0 ? `/admin/raw-materials?tab=ready-made&filter=${filter}` : `/admin/raw-materials?filter=${filter}`;
}

export default function AdminDashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterialDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  // Cost figures are admin-only, like the reports they come from.
  const [isAdmin] = useState(() => getStoredUser()?.role === "admin");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, mats] = await Promise.all([
        apiFetch<Product[]>("/api/products", { auth: "staff" }), // cost comes back for admins only
        apiFetch<RawMaterialDTO[]>("/api/raw-materials", { auth: "staff" }),
      ]);
      setProducts(prods);
      setMaterials(mats);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const categoryCount = new Set(products.map((p) => p.categoryId)).size;
  const inUse = materials.filter((m) => m.isActive);
  const readyMade = products.filter(isReadyMade);
  // At or below the minimum, ones that ran out included (UI review #9).
  const lowMaterials = inUse.filter((m) => m.isLow).length;
  const outMaterials = inUse.filter((m) => m.stockQty <= 0).length;
  const lowReadyMade = readyMade.filter((p) => (p.stockQty ?? 0) <= (p.minStockThreshold ?? 0)).length;
  const outReadyMade = readyMade.filter((p) => (p.stockQty ?? 0) <= 0).length;
  const lowCount = lowMaterials + lowReadyMade;
  const outCount = outMaterials + outReadyMade;
  const lowHref = stockHref("low", lowMaterials, lowReadyMade);
  const outHref = stockHref("out", outMaterials, outReadyMade);
  // Dishes hold no stock of their own: the inventory's value is its raw materials and
  // its ready-made items' pieces.
  const inventoryValueAtCost =
    materials.reduce((sum, m) => sum + (m.costPerUnit ?? 0) * m.stockQty, 0) +
    readyMade.reduce((sum, p) => sum + (p.cost ?? 0) * Math.max(0, p.stockQty ?? 0), 0);
  // The value only counts items with a cost recorded, so say how many that is
  // (UI review #10): "At cost · 2 of 23 items have a cost".
  const stockItems = materials.length + readyMade.length;
  const costedItems = materials.filter((m) => m.costPerUnit != null).length + readyMade.filter((p) => p.cost != null).length;
  const inventoryValueSub =
    costedItems === stockItems ? "Raw materials and ready-made items at cost" : `At cost · ${costedItems} of ${stockItems} item${stockItems !== 1 ? "s" : ""} have a cost`;

  if (loading) return <div className="text-adm-ink-3">Loading…</div>;

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader eyebrow="Realtime stock tracking" title="Live stock dashboard" />

      {message && <div className="text-sm text-adm-bad">{message}</div>}

      {lowCount > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3.5 rounded-[6px] border border-adm-warn bg-adm-warn-soft px-4 py-3.5">
          <span className="h-1.75 w-1.75 flex-shrink-0 rounded-full bg-adm-warn" />
          <div className="min-w-0 flex-1 text-base font-medium md:text-sm">
            {lowCount} item{lowCount !== 1 ? "s" : ""} at or below minimum stock
          </div>
          <Link href={lowHref} className={admButtonClass({ variant: "secondary", size: "compact" })}>
            See more
          </Link>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3.5 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <KpiTile label="Active SKUs" value={String(products.length)} sub={`${categoryCount} categories`} />
        {isAdmin && (
          <KpiTile label="Inventory value" value={`₱${inventoryValueAtCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} sub={inventoryValueSub} />
        )}
        <KpiTile label="Needs restock" value={String(lowCount)} sub="Items at or below minimum" color="var(--adm-warn)" href={lowHref} />
        <KpiTile label="Out of stock" value={String(outCount)} sub="Items with none left" color="var(--adm-bad)" href={outHref} />
      </div>

      <Card title="Servings available per dish (pieces for ready-made items)">
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
                    {p.stockQty ?? 0} {isReadyMade(p) ? "pieces" : "servings"}
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
              <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                <th className="px-4.5 py-2.75 font-medium">Product</th>
                <th className="px-3 py-2.75 font-medium">Category</th>
                <th className="px-3 py-2.75 text-right font-medium">Servings / pieces</th>
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
                    </td>
                    <td className="px-3 py-3 text-adm-ink-2 whitespace-nowrap">{p.category?.name}</td>
                    <td className="font-adm-mono px-3 py-3 text-right whitespace-nowrap">
                      {p.stockQty ?? 0}
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
