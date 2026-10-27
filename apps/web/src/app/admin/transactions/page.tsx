"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getSocket } from "@/lib/websocket";
import { PageHeader, Card, AdmButton, StatusPill, admInputClass, admLabelClass } from "@/components/admin/ui";
import { LoadErrorAlert } from "@/components/LoadErrorAlert";
import { formatDateTime } from "@/lib/time";
import type { OrderStatus, OrderTimeline, TransactionDTO, TransactionPageDTO } from "@zaks/shared-types";

// Transaction history (Administrator only): every order in a date range, today by
// default, newest first, filtered by status, payment method, paid or unpaid, and order
// number. Totals cover every matching order, and each order opens to show its items and
// when it reached each step. Reloads by itself when an order changes (orders:changed).

const STATUS: Record<OrderStatus, { label: string; tone?: "ok" | "warn" | "bad" }> = {
  pending: { label: "UNPAID", tone: "warn" },
  confirmed: { label: "CONFIRMED" },
  preparing: { label: "PREPARING" },
  ready: { label: "READY", tone: "ok" },
  completed: { label: "HANDED OVER", tone: "ok" },
  cancelled: { label: "CANCELLED", tone: "bad" },
};

const METHOD_LABEL: Record<string, string> = { counter: "Counter", qrph: "QR Ph", gcash: "GCash", maya: "Maya" };

const TIMELINE_STEPS: { key: keyof OrderTimeline; label: string }[] = [
  { key: "placedAt", label: "Placed" },
  { key: "paidAt", label: "Paid" },
  { key: "preparingAt", label: "Preparing" },
  { key: "readyAt", label: "Ready" },
  { key: "handedOverAt", label: "Handed over" },
  { key: "cancelledAt", label: "Cancelled" },
];

interface Filters {
  from: string;
  to: string;
  status: string;
  method: string;
  paid: string;
  q: string;
}

const peso = (n: number) => `₱${n.toFixed(2)}`;

function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = STATUS[status];
  if (tone) return <StatusPill tone={tone}>{label}</StatusPill>;
  return <span className="font-adm-mono rounded-[3px] bg-adm-surface-2 px-2 py-0.75 text-xs whitespace-nowrap text-adm-ink-2">{label}</span>;
}

export default function AdminTransactionsPage() {
  // Empty dates = today (the API fills them in and the page shows what it used).
  const [filters, setFilters] = useState<Filters>({ from: "", to: "", status: "", method: "", paid: "", q: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TransactionPageDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // The order-number search waits until typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    try {
      setResult(await apiFetch<TransactionPageDTO>(`/api/orders/history?${params}`, { auth: "staff" }));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "The server didn't respond. Check the connection, then try again.");
    }
  }, [filters, page]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const socket = getSocket();
    socket.on("orders:changed", load);
    return () => {
      clearTimeout(first);
      socket.off("orders:changed", load);
    };
  }, [load]);

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  function setFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const from = filters.from || result?.from || "";
  const to = filters.to || result?.to || "";
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const rangeText = result ? (result.from === result.to ? result.from : `${result.from} to ${result.to}`) : "";

  return (
    <div className="flex flex-col gap-4.5">
      <div>
        <PageHeader eyebrow="Sales" title="Transactions" />
        <p className="text-base text-adm-ink-2 md:text-sm">
          Every order with its payment and status. Open an order to see its items and when it reached each step.
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <label className="block">
            <span className={admLabelClass}>From</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFilter("from", e.target.value)} className={admInputClass} />
          </label>
          <label className="block">
            <span className={admLabelClass}>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setFilter("to", e.target.value)} className={admInputClass} />
          </label>
          <label className="block">
            <span className={admLabelClass}>Status</span>
            <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={admInputClass}>
              <option value="">Any status</option>
              <option value="pending">Unpaid</option>
              <option value="confirmed">Confirmed</option>
              <option value="preparing">Preparing</option>
              <option value="ready">Ready</option>
              <option value="completed">Handed over</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="block">
            <span className={admLabelClass}>Payment method</span>
            <select value={filters.method} onChange={(e) => setFilter("method", e.target.value)} className={admInputClass}>
              <option value="">Any method</option>
              <option value="counter">Counter</option>
              <option value="qrph">QR Ph</option>
            </select>
          </label>
          <label className="block">
            <span className={admLabelClass}>Payment</span>
            <select value={filters.paid} onChange={(e) => setFilter("paid", e.target.value)} className={admInputClass}>
              <option value="">Paid or unpaid</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
          <label className="block">
            <span className={admLabelClass}>Order number</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. ZK-LTLY9N"
              className={`font-adm-mono ${admInputClass}`}
            />
          </label>
        </div>
      </Card>

      {loadError && <LoadErrorAlert what="the transactions" detail={loadError} onRetry={retry} retrying={retrying} stale={result !== null} />}

      {result && (
        <div aria-live="polite" className="flex flex-wrap gap-x-5 gap-y-1 text-base text-adm-ink-2 md:text-sm">
          <span>
            <strong className="text-adm-ink">{result.total}</strong> order{result.total !== 1 ? "s" : ""} · {rangeText}
          </span>
          <span>
            Sales <strong className="text-adm-ink">{peso(result.sales)}</strong> from {result.paidCount} paid order{result.paidCount !== 1 ? "s" : ""}
          </span>
          <span>
            Average order value <strong className="text-adm-ink">{result.averageOrderValue === null ? "—" : peso(result.averageOrderValue)}</strong>
          </span>
        </div>
      )}

      {!result ? (
        !loadError && <div className="text-adm-ink-3">Loading…</div>
      ) : result.orders.length === 0 ? (
        <div className="text-adm-ink-3">No orders match these filters.</div>
      ) : (
        <Card>
          <ul className="divide-y divide-adm-line-soft">
            {result.orders.map((order) => (
              <TransactionRow key={order.id} order={order} />
            ))}
          </ul>
        </Card>
      )}

      {result && pages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <AdmButton variant="secondary" size="compact" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </AdmButton>
          <span className="text-sm text-adm-ink-3">
            Page {result.page} of {pages}
          </span>
          <AdmButton variant="secondary" size="compact" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </AdmButton>
        </div>
      )}
    </div>
  );
}

function TransactionRow({ order }: { order: TransactionDTO }) {
  const method = order.payment ? (METHOD_LABEL[order.payment.method] ?? order.payment.method) : "—";
  const paid = order.payment?.status === "paid";
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-col gap-1 p-4 hover:bg-adm-surface-2 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-adm-mono text-base font-bold">{order.orderNumber}</span>
              <StatusBadge status={order.status} />
              {order.stockIssue && <StatusPill tone="bad">STOCK ISSUE</StatusPill>}
            </div>
            <div className="text-base break-words text-adm-ink-2 md:text-sm">
              {order.items.map((i) => `${i.qty}× ${i.productName}`).join(", ")}
            </div>
          </div>
          <div className="shrink-0 text-sm text-adm-ink-3 sm:text-right">
            <div className="font-adm-mono text-base font-bold text-adm-ink">{peso(order.totalAmount)}</div>
            <div>
              {formatDateTime(order.createdAt)} · {order.orderType === "take_out" ? "Take out" : "Dine in"} · {method}
              {paid ? " · paid" : " · unpaid"}
            </div>
          </div>
        </summary>
        <div className="grid gap-4 border-t border-adm-line-soft bg-adm-bg px-4 py-3.5 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs tracking-[.07em] text-adm-ink-3 uppercase">Items</div>
            <ul className="space-y-1 text-base md:text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0 break-words">
                    {item.qty}× {item.productName}
                    {item.specialInstructions && <span className="block text-adm-ink-3 italic">&ldquo;{item.specialInstructions}&rdquo;</span>}
                  </span>
                  <span className="font-adm-mono shrink-0">{peso(item.subtotal)}</span>
                </li>
              ))}
            </ul>
            {order.stockIssueNote && <p className="mt-2 text-sm text-adm-bad">{order.stockIssueNote}</p>}
          </div>
          <div>
            <div className="mb-1.5 text-xs tracking-[.07em] text-adm-ink-3 uppercase">Timeline</div>
            <ol className="space-y-1 text-base md:text-sm">
              {TIMELINE_STEPS.filter((step) => order.timeline[step.key]).map((step) => (
                <li key={step.key} className="flex justify-between gap-3">
                  <span>{step.label}</span>
                  <time className="text-adm-ink-2" dateTime={order.timeline[step.key]!}>
                    {formatDateTime(order.timeline[step.key]!)}
                  </time>
                </li>
              ))}
            </ol>
            {order.payment?.reference && <p className="mt-2 text-sm break-all text-adm-ink-3">Payment reference: {order.payment.reference}</p>}
          </div>
        </div>
      </details>
    </li>
  );
}
