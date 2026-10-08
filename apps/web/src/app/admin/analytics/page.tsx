"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { downloadAuthenticated } from "@/lib/download";
import { PageHeader, Card, KpiTile, AdmButton } from "@/components/admin/ui";
import type { InventoryMovementPoint, Product, ProfitabilityPoint, RawMaterialDTO, SalesReportPoint, TopProductPoint } from "@zaks/shared-types";

type Range = "daily" | "weekly" | "monthly";

// What each range covers, matching the API's windows (reports/service.ts
// rangeWindowDays). Every tile and card says which period it shows, because they
// differ: revenue and orders follow the range, the product rankings are all-time
// sales, and restock is right now (UI review #11).
const RANGES: { id: Range; label: string; period: string; buckets: string }[] = [
  { id: "daily", label: "Daily", period: "Last 14 days", buckets: "by day" },
  { id: "weekly", label: "Weekly", period: "Last 8 weeks", buckets: "by week" },
  { id: "monthly", label: "Monthly", period: "Last 6 months", buckets: "by month" },
];

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>("daily");
  const [sales, setSales] = useState<SalesReportPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductPoint[]>([]);
  const [movement, setMovement] = useState<InventoryMovementPoint[]>([]);
  const [profitability, setProfitability] = useState<ProfitabilityPoint[]>([]);
  // The same count as the dashboard's "Needs restock" tile: products at or below their
  // own minimum (including sold out) plus low raw materials.
  const [restockCount, setRestockCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // Each range switch (daily/weekly/monthly) fires four fresh requests with no
  // ordering guard between them — clicking through ranges quickly could let an older
  // response resolve after a newer one and overwrite it with stale data. `cancelled`
  // here (matching the pattern already used in useCatalog.ts) drops any response that
  // arrives after the range has since changed again.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [s, t, m, p, low, materials] = await Promise.all([
          apiFetch<SalesReportPoint[]>(`/api/reports/sales?range=${range}`, { auth: "staff" }),
          apiFetch<TopProductPoint[]>("/api/reports/top-products?limit=8", { auth: "staff" }),
          apiFetch<InventoryMovementPoint[]>("/api/reports/inventory-movement", { auth: "staff" }),
          apiFetch<ProfitabilityPoint[]>("/api/reports/profitability", { auth: "staff" }),
          apiFetch<Product[]>("/api/inventory/low-stock", { auth: "staff" }),
          apiFetch<RawMaterialDTO[]>("/api/raw-materials", { auth: "staff" }),
        ]);
        if (cancelled) return;
        setRestockCount(low.length + materials.filter((mat) => mat.isActive && mat.isLow).length);
        setSales(s);
        setTopProducts(t);
        setMovement(m);
        // marginPct is null whenever price is 0 (a promo/free item), independent of
        // whether cost is recorded — filtering on cost alone let a 0-price item with a
        // recorded cost through, and the table below assumes marginPct is always a
        // number for anything it renders.
        setProfitability(p.filter((x) => x.cost !== null && x.marginPct !== null).slice(0, 10));
      } catch (err) {
        if (cancelled) return;
        setMessage(err instanceof ApiError ? err.message : "Could not load analytics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const totalRevenue = sales.reduce((s, p) => s + p.revenue, 0);
  const totalOrders = sales.reduce((s, p) => s + p.orderCount, 0);
  const current = RANGES.find((r) => r.id === range)!;
  const top = topProducts[0];

  async function handleExport(type: "sales" | "top-products" | "inventory-movement" | "profitability") {
    try {
      await downloadAuthenticated(
        `/api/reports/export?type=${type}&format=csv${type === "sales" ? `&range=${range}` : ""}`,
        `${type}.csv`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Export failed.");
    }
  }

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader eyebrow="Visual analytics & reports" title="Performance" />

      {message && <div className="text-base text-adm-bad md:text-sm">{message}</div>}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span id="period-label" className="text-sm font-medium text-adm-ink-2">
          Sales period
        </span>
        <div role="group" aria-labelledby="period-label" className="flex gap-1 rounded-[6px] border border-adm-line bg-adm-surface p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`min-h-11 flex-1 rounded-[4px] px-3 text-base font-medium transition-colors sm:flex-none md:min-h-8 md:text-[12.5px] ${
                range === r.id ? "bg-adm-accent text-adm-accent-ink" : "text-adm-ink-2"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-adm-ink-3">{current.period}, {current.buckets}</span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Revenue" value={`₱${totalRevenue.toFixed(2)}`} sub={current.period} />
        <KpiTile label="Orders" value={String(totalOrders)} sub={`Paid orders · ${current.period.toLowerCase()}`} />
        <KpiTile label="Top product" value={top?.productName ?? "—"} sub={top ? `All time · ${top.qtySold} sold` : "All time"} />
        <KpiTile
          label="Needs restock"
          value={restockCount === null ? "—" : String(restockCount)}
          sub="Right now · at or below minimum"
          color="var(--adm-warn)"
        />
      </div>

      <Card
        title={`Sales · ${current.period.toLowerCase()}, ${current.buckets}`}
        actions={
          <AdmButton variant="secondary" size="compact" onClick={() => handleExport("sales")}>
            Export CSV
          </AdmButton>
        }
      >
        <div className="p-4">
          {loading ? (
            <div className="text-adm-ink-3">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sales}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--adm-line)" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `₱${Number(v).toFixed(2)}`} />
                <Bar dataKey="revenue" fill="var(--adm-accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-2">
        <Card
          title="Top-selling products · all time"
          actions={
            <AdmButton variant="secondary" size="compact" onClick={() => handleExport("top-products")}>
              Export CSV
            </AdmButton>
          }
        >
          <div className="p-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--adm-line)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="productName" width={104} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qtySold" fill="var(--adm-warn)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Profitability per item · all-time sales"
          actions={
            <AdmButton variant="secondary" size="compact" onClick={() => handleExport("profitability")}>
              Export CSV
            </AdmButton>
          }
        >
          {profitability.length === 0 ? (
            <div className="p-4 text-base text-adm-ink-3 md:text-sm">
              No products have a cost recorded yet — add one in Products to see margins here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-base md:text-sm">
                <thead>
                  <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                    <th className="px-4.5 py-2.75 font-medium">Item</th>
                    <th className="px-3 py-2.75 text-right font-medium">Cost</th>
                    <th className="px-3 py-2.75 text-right font-medium">Price</th>
                    <th className="px-3 py-2.75 text-right font-medium">Margin</th>
                    <th className="px-4.5 py-2.75 text-right font-medium">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {profitability.map((p) => (
                    <tr key={p.productId} className="border-t border-adm-line-soft">
                      <td className="px-4.5 py-2.75">{p.productName}</td>
                      <td className="font-adm-mono px-3 py-2.75 text-right text-adm-ink-2">₱{p.cost!.toFixed(2)}</td>
                      <td className="font-adm-mono px-3 py-2.75 text-right">₱{p.price.toFixed(2)}</td>
                      <td
                        className="font-adm-mono px-3 py-2.75 text-right"
                        style={{ color: (p.marginPct ?? 0) >= 40 ? "var(--adm-ok)" : (p.marginPct ?? 0) >= 25 ? "var(--adm-ink-2)" : "var(--adm-warn)" }}
                      >
                        {p.marginPct!.toFixed(1)}%
                      </td>
                      <td className="font-adm-mono px-4.5 py-2.75 text-right">₱{(p.grossProfit ?? 0).toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Inventory movement · sold all time, stock now"
        actions={
          <AdmButton variant="secondary" size="compact" onClick={() => handleExport("inventory-movement")}>
            Export CSV
          </AdmButton>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-base md:text-sm">
            <thead>
              <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                <th className="px-4.5 py-2.75 font-medium">Product</th>
                <th className="px-3 py-2.75 text-right font-medium">Units sold</th>
                <th className="px-4.5 py-2.75 text-right font-medium">Current stock</th>
              </tr>
            </thead>
            <tbody>
              {movement.map((m) => (
                <tr key={m.productId} className="border-t border-adm-line-soft">
                  <td className="px-4.5 py-2.75">{m.productName}</td>
                  <td className="font-adm-mono px-3 py-2.75 text-right">{m.qtySold}</td>
                  <td className="font-adm-mono px-4.5 py-2.75 text-right">{m.currentStock ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
