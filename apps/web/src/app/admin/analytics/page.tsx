"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { downloadAuthenticated } from "@/lib/download";
import { PageHeader, Card, KpiTile, AdmButton } from "@/components/admin/ui";
import type { InventoryMovementPoint, ProfitabilityPoint, SalesReportPoint, TopProductPoint } from "@zaks/shared-types";

type Range = "daily" | "weekly" | "monthly";

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>("daily");
  const [sales, setSales] = useState<SalesReportPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductPoint[]>([]);
  const [movement, setMovement] = useState<InventoryMovementPoint[]>([]);
  const [profitability, setProfitability] = useState<ProfitabilityPoint[]>([]);
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
        const [s, t, m, p] = await Promise.all([
          apiFetch<SalesReportPoint[]>(`/api/reports/sales?range=${range}`, { auth: "staff" }),
          apiFetch<TopProductPoint[]>("/api/reports/top-products?limit=8", { auth: "staff" }),
          apiFetch<InventoryMovementPoint[]>("/api/reports/inventory-movement", { auth: "staff" }),
          apiFetch<ProfitabilityPoint[]>("/api/reports/profitability", { auth: "staff" }),
        ]);
        if (cancelled) return;
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

      {message && <div className="text-sm text-adm-bad">{message}</div>}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <KpiTile label="Revenue" value={`₱${totalRevenue.toFixed(2)}`} />
        <KpiTile label="Orders" value={String(totalOrders)} />
        <KpiTile label="Top product" value={topProducts[0]?.productName ?? "—"} />
        <KpiTile
          label="Low stock"
          value={String(movement.filter((m) => (m.currentStock ?? 0) <= 5).length)}
          color="var(--adm-warn)"
        />
      </div>

      <Card
        title="Sales"
        actions={
          <div className="flex items-center gap-2">
            {(["daily", "weekly", "monthly"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-[4px] px-2.5 py-1 text-[11.5px] font-medium ${
                  range === r ? "border border-adm-accent text-adm-accent" : "text-adm-ink-2"
                }`}
              >
                {r}
              </button>
            ))}
            <AdmButton variant="secondary" className="px-2.5 py-1 text-[11.5px]" onClick={() => handleExport("sales")}>
              Export CSV
            </AdmButton>
          </div>
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
          title="Top-selling products"
          actions={
            <AdmButton variant="secondary" className="px-2.5 py-1 text-[11.5px]" onClick={() => handleExport("top-products")}>
              Export CSV
            </AdmButton>
          }
        >
          <div className="p-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--adm-line)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="productName" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qtySold" fill="var(--adm-warn)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Profitability per item"
          actions={
            <AdmButton variant="secondary" className="px-2.5 py-1 text-[11.5px]" onClick={() => handleExport("profitability")}>
              Export CSV
            </AdmButton>
          }
        >
          {profitability.length === 0 ? (
            <div className="p-4 text-sm text-adm-ink-3">
              No products have a cost recorded yet — add one in Products to see margins here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
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
        title="Inventory movement"
        actions={
          <AdmButton variant="secondary" className="px-2.5 py-1 text-[11.5px]" onClick={() => handleExport("inventory-movement")}>
            Export CSV
          </AdmButton>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
