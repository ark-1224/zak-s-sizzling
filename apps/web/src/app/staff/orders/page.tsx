"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PageHeader, Card, AdmButton, StatusPill, admInputClass } from "@/components/admin/ui";
import { formatDateTime, timeAgo } from "@/lib/time";
import type { OrderDTO } from "@zaks/shared-types";

// New in Sprint 3 — lets front-desk staff find counter orders awaiting payment and
// confirm them, per the manuscript's "Billing and Payment Processing" staff requirement.
// Staff confirm first and collect the money after: confirming checks and deducts the
// stock, so a short order is caught before any money changes hands
// (docs/design/raw-material-stock.md 3.2). Online orders that were paid after their
// stock ran out are listed too, flagged as a stock issue for staff to sort out.
// Each order shows how long ago it was placed, and the list can be searched by order
// number (the customer reads it off their receipt screen).
export default function StaffOrdersPage() {
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Keep "placed X min ago" current without refetching.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<OrderDTO[]>("/api/orders?unpaid=1", { auth: "staff" });
      setOrders(result);
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : "Could not load orders.", error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Letters and digits only, so "ltly9n", "ZK LTLY" and "zk-ltly9n" all find ZK-LTLY9N.
  const normalize = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const search = normalize(query);
  const shown = search ? orders.filter((o) => normalize(o.orderNumber).includes(search)) : orders;

  async function handleConfirm(order: OrderDTO) {
    setConfirmingId(order.id);
    try {
      await apiFetch(`/api/payments/counter/${order.id}/confirm`, { method: "POST", auth: "staff" });
      setMessage({ text: `${order.orderNumber} confirmed and sent to the kitchen. Collect ₱${order.totalAmount.toFixed(2)} from the customer.`, error: false });
      await load();
    } catch (err) {
      // A 409 here is usually a shortage: nothing was deducted and the order is still
      // unpaid, so the customer can change their order before paying.
      const text = err instanceof ApiError ? err.message : "Could not confirm the order.";
      setMessage({ text: `${order.orderNumber}: ${text} Ask the customer to change the order before collecting payment.`, error: true });
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4.5">
      <div>
        <PageHeader eyebrow="Billing & payment" title="Orders awaiting payment" />
        <p className="text-base text-adm-ink-2 md:text-sm">
          Counter orders show up here once placed. <strong>Confirm, then collect payment:</strong> confirming checks the stock
          first, so if something has run out you can change the order before the customer pays.
        </p>
      </div>

      {message && (
        <div role="status" className={`text-base md:text-sm ${message.error ? "text-adm-bad" : "text-adm-ink"}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-adm-ink-3">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="text-adm-ink-3">Nothing awaiting payment right now.</div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order number"
              aria-label="Search orders by order number"
              className={`font-adm-mono sm:max-w-80 ${admInputClass}`}
            />
            <span className="text-sm text-adm-ink-3" aria-live="polite">
              {search ? `${shown.length} of ${orders.length} orders` : `${orders.length} order${orders.length !== 1 ? "s" : ""} waiting`}
            </span>
          </div>
          {shown.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 text-adm-ink-3">
              No order number matches &ldquo;{query.trim()}&rdquo;.
              <AdmButton variant="secondary" size="compact" onClick={() => setQuery("")}>
                Clear search
              </AdmButton>
            </div>
          ) : (
            <Card>
              <ul className="divide-y divide-adm-line-soft">
                {shown.map((order) => (
                  <li key={order.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-adm-mono text-lg font-bold">{order.orderNumber}</span>
                        {order.stockIssue && <StatusPill tone="bad">STOCK ISSUE</StatusPill>}
                      </div>
                      <div className="text-base break-words text-adm-ink-2 md:text-sm">
                        {order.items.map((i) => `${i.qty}× ${i.productName}`).join(", ")}
                      </div>
                      <div className="mt-1 text-sm text-adm-ink-3">
                        <span className="capitalize">{order.payment?.method ?? "counter"}</span> · ₱{order.totalAmount.toFixed(2)}
                        {order.payment?.status === "paid" && " · paid"} ·{" "}
                        <time dateTime={order.createdAt} title={formatDateTime(order.createdAt)}>
                          placed {timeAgo(order.createdAt, now)}
                        </time>
                      </div>
                      {order.stockIssue && (
                        <div className="mt-2 rounded-[5px] border border-adm-bad bg-adm-bad-soft p-2.5 text-base text-adm-ink md:text-sm">
                          Paid online, but the stock ran out before the payment arrived, so nothing was sent to the kitchen.
                          {order.stockIssueNote && <span className="mt-1 block text-adm-ink-2">{order.stockIssueNote}</span>}
                          <span className="mt-1 block text-adm-ink-2">Talk to the customer about a substitute or a refund.</span>
                        </div>
                      )}
                    </div>
                    {!order.stockIssue && (
                      <AdmButton
                        variant="primary"
                        className="w-full shrink-0 sm:w-auto"
                        disabled={confirmingId === order.id}
                        onClick={() => handleConfirm(order)}
                      >
                        {confirmingId === order.id ? "Checking stock…" : "Confirm order"}
                      </AdmButton>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
