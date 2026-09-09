"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { downloadAuthenticated } from "@/lib/download";
import type { InventoryMovementPoint, SalesReportPoint, TopProductPoint } from "@zaks/shared-types";

type Range = "daily" | "weekly" | "monthly";

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>("daily");
  const [sales, setSales] = useState<SalesReportPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductPoint[]>([]);
  const [movement, setMovement] = useState<InventoryMovementPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    try {
      const [s, t, m] = await Promise.all([
        apiFetch<SalesReportPoint[]>(`/api/reports/sales?range=${r}`, { auth: "staff" }),
        apiFetch<TopProductPoint[]>("/api/reports/top-products?limit=8", { auth: "staff" }),
        apiFetch<InventoryMovementPoint[]>("/api/reports/inventory-movement", { auth: "staff" }),
      ]);
      setSales(s);
      setTopProducts(t);
      setMovement(m);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const totalRevenue = sales.reduce((s, p) => s + p.revenue, 0);
  const totalOrders = sales.reduce((s, p) => s + p.orderCount, 0);

  async function handleExport(type: "sales" | "top-products" | "inventory-movement") {
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
    <div className="min-h-screen bg-cream p-8">
      <Link href="/admin" className="mb-4 inline-block text-sm text-ink-soft">
        ← Back to dashboard
      </Link>
      <h1 className="font-display mb-6 text-2xl font-semibold text-matcha-deep">Analytics</h1>

      {message && <div className="mb-4 text-sm text-berry">{message}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Revenue" value={`₱${totalRevenue.toFixed(2)}`} />
        <StatTile label="Orders" value={String(totalOrders)} />
        <StatTile label="Top product" value={topProducts[0]?.productName ?? "—"} />
        <StatTile label="Low stock" value={String(movement.filter((m) => (m.currentStock ?? 0) <= 5).length)} />
      </div>

      <Section
        title="Sales"
        actions={
          <div className="flex items-center gap-2">
            {(["daily", "weekly", "monthly"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  range === r ? "bg-matcha text-cream" : "bg-white text-ink-soft"
                }`}
              >
                {r}
              </button>
            ))}
            <button
              onClick={() => handleExport("sales")}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft"
            >
              Export CSV
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="text-ink-soft">Loading…</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e1d0ae" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `₱${Number(v).toFixed(2)}`} />
              <Bar dataKey="revenue" fill="#d8592b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section
        title="Top-selling products"
        actions={
          <button
            onClick={() => handleExport("top-products")}
            className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft"
          >
            Export CSV
          </button>
        }
      >
        {loading ? (
          <div className="text-ink-soft">Loading…</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topProducts} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e1d0ae" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="productName" width={120} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="qtySold" fill="#cc8a2e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section
        title="Inventory movement"
        actions={
          <button
            onClick={() => handleExport("inventory-movement")}
            className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft"
          >
            Export CSV
          </button>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft">
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5">Units sold</th>
                <th className="px-4 py-2.5">Current stock</th>
              </tr>
            </thead>
            <tbody>
              {movement.map((m) => (
                <tr key={m.productId} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">{m.productName}</td>
                  <td className="px-4 py-2.5">{m.qtySold}</td>
                  <td className="px-4 py-2.5">{m.currentStock ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="font-display mt-1 truncate text-xl font-bold text-matcha-deep">{value}</div>
    </div>
  );
}

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-ink">{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}
