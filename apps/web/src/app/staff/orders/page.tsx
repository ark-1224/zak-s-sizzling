"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PageHeader, Card, AdmButton, StatusPill, admInputClass } from "@/components/admin/ui";
import { LoadErrorAlert } from "@/components/LoadErrorAlert";
import { formatDateTime, timeAgo } from "@/lib/time";
import type { OrderDTO } from "@zaks/shared-types";

// New in Sprint 3 — lets front-desk staff find counter orders awaiting payment and
// confirm them, per the manuscript's "Billing and Payment Processing" staff requirement.
// Staff confirm first and collect the money after: confirming checks and deducts the
// stock, so a short order is caught before any money changes hands
// (docs/design/raw-material-stock.md 3.2). Online orders that were paid after their
// stock ran out are listed too, flagged as a stock issue for staff to sort out.
// Each order shows how long ago it was placed, and the list can be searched by order
// number (the customer reads it off their receipt screen). An abandoned unpaid order
// can be cancelled, after a second click to make sure (UI review #15).
const ONLINE_LABEL: Record<string, string> = { gcash: "GCash", maya: "Maya" };

/**
 * The customer pays at the counter unless an online payment was started: a GCash or
 * Maya order with no PayMongo reference never reached the payment page (for example,
 * online payment wasn't set up), so it's labelled a counter order (UI review #2).
 */
function paymentLabel(order: OrderDTO): { method: string; note?: string } {
  const payment = order.payment;
  if (!payment || payment.method === "counter") return { method: "Counter" };
  const online = ONLINE_LABEL[payment.method] ?? payment.method;
  if (payment.status !== "paid" && !payment.reference) return { method: "Counter", note: `chose ${online}, but online payment didn't start` };
  return { method: online };
}

function PaymentMethodText({ order }: { order: OrderDTO }) {
  const { method, note } = paymentLabel(order);
  return (
    <>
      {method}
      {note && <span className="italic"> ({note})</span>}
    </>
  );
}

export default function StaffOrdersPage() {
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  // `loaded` turns true after the first successful load and stays true, so a later
  // refresh never blanks the list; a failed load sets `loadError` instead of looking empty.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // The order whose "Cancel order" was clicked once and now asks to be sure.
  const [cancelAskId, setCancelAskId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Keep "placed X min ago" current without refetching.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<OrderDTO[]>("/api/orders?unpaid=1", { auth: "staff" });
      setOrders(result);
      setLoaded(true);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "The server didn't respond. Check the connection, then try again.");
    }
  }, []);

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

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

  async function handleCancel(order: OrderDTO) {
    setCancellingId(order.id);
    try {
      await apiFetch(`/api/orders/${order.id}/cancel`, { method: "POST", auth: "staff" });
      setMessage({ text: `${order.orderNumber} was cancelled and removed from the queue.`, error: false });
      setCancelAskId(null);
      await load();
    } catch (err) {
      // A 409 means it was paid (or cancelled) meanwhile; the refreshed list shows which.
      const text = err instanceof ApiError ? err.message : "Could not cancel the order.";
      setMessage({ text: `${order.orderNumber}: ${text}`, error: true });
      setCancelAskId(null);
      await load();
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4.5">
      <div>
        <PageHeader eyebrow="Billing & payment" title="Orders awaiting payment" />
        <p className="text-base text-adm-ink-2 md:text-sm">
          Counter orders show up here once placed. <strong>Confirm, then collect payment:</strong> confirming checks the stock
          first, so if something has run out you can change the order before the customer pays. Cancel an order the customer
          never came back to pay for.
        </p>
      </div>

      {message && (
        <div role="status" className={`text-base md:text-sm ${message.error ? "text-adm-bad" : "text-adm-ink"}`}>
          {message.text}
        </div>
      )}

      {loadError && <LoadErrorAlert what="the orders" detail={loadError} onRetry={retry} retrying={retrying} stale={loaded} />}

      {!loaded ? (
        !loadError && <div className="text-adm-ink-3">Loading…</div>
      ) : orders.length === 0 ? (
        !loadError && 
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
                        {order.status === "cancelled" && <StatusPill tone="warn">CANCELLED</StatusPill>}
                      </div>
                      <div className="text-base break-words text-adm-ink-2 md:text-sm">
                        {order.items.map((i) => `${i.qty}× ${i.productName}`).join(", ")}
                      </div>
                      <div className="mt-1 text-sm text-adm-ink-3">
                        <PaymentMethodText order={order} /> · ₱{order.totalAmount.toFixed(2)}
                        {order.payment?.status === "paid" && " · paid"} ·{" "}
                        <time dateTime={order.createdAt} title={formatDateTime(order.createdAt)}>
                          placed {timeAgo(order.createdAt, now)}
                        </time>
                      </div>
                      {order.stockIssue && (
                        <div className="mt-2 rounded-[5px] border border-adm-bad bg-adm-bad-soft p-2.5 text-base text-adm-ink md:text-sm">
                          {order.status === "cancelled"
                            ? "Paid online after this order was cancelled, so nothing was sent to the kitchen."
                            : "Paid online, but the stock ran out before the payment arrived, so nothing was sent to the kitchen."}
                          {order.stockIssueNote && <span className="mt-1 block text-adm-ink-2">{order.stockIssueNote}</span>}
                          <span className="mt-1 block text-adm-ink-2">
                            {order.status === "cancelled"
                              ? "Refund the customer, or place the order again for them."
                              : "Talk to the customer about a substitute or a refund."}
                          </span>
                        </div>
                      )}
                    </div>
                    {!order.stockIssue &&
                      (cancelAskId === order.id ? (
                        <div
                          role="group"
                          aria-label={`Cancel ${order.orderNumber}?`}
                          className="flex shrink-0 flex-col gap-2 rounded-[6px] border border-adm-bad bg-adm-bad-soft p-3 sm:max-w-72"
                        >
                          <span className="text-base text-adm-ink md:text-sm">
                            Cancel <strong className="font-adm-mono">{order.orderNumber}</strong>? It leaves the queue and can&apos;t be
                            paid any more.
                          </span>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <AdmButton
                              variant="danger"
                              size="compact"
                              className="bg-adm-surface"
                              disabled={cancellingId === order.id}
                              onClick={() => handleCancel(order)}
                            >
                              {cancellingId === order.id ? "Cancelling…" : "Yes, cancel order"}
                            </AdmButton>
                            <AdmButton
                              variant="secondary"
                              size="compact"
                              disabled={cancellingId === order.id}
                              onClick={() => setCancelAskId(null)}
                            >
                              Keep order
                            </AdmButton>
                          </div>
                        </div>
                      ) : (
                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                          <AdmButton
                            variant="secondary"
                            className="w-full sm:w-auto"
                            disabled={confirmingId === order.id}
                            onClick={() => setCancelAskId(order.id)}
                          >
                            Cancel order
                          </AdmButton>
                          <AdmButton
                            variant="primary"
                            className="w-full sm:w-auto"
                            disabled={confirmingId === order.id}
                            onClick={() => handleConfirm(order)}
                          >
                            {confirmingId === order.id ? "Checking stock…" : "Confirm order"}
                          </AdmButton>
                        </div>
                      ))}
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
