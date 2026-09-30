"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PageHeader, Card, AdmButton, StatusPill } from "@/components/admin/ui";
import type { OrderDTO } from "@zaks/shared-types";

// New in Sprint 3 — lets front-desk staff find counter orders awaiting payment and
// confirm them, per the manuscript's "Billing and Payment Processing" staff requirement.
// Staff confirm first and collect the money after: confirming checks and deducts the
// stock, so a short order is caught before any money changes hands
// (docs/design/raw-material-stock.md 3.2). Online orders that were paid after their
// stock ran out are listed too, flagged as a stock issue for staff to sort out.
export default function StaffOrdersPage() {
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

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
        <Card>
          <ul className="divide-y divide-adm-line-soft">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-adm-mono text-lg font-bold">{order.orderNumber}</span>
                    {order.stockIssue && <StatusPill tone="bad">STOCK ISSUE</StatusPill>}
                  </div>
                  <div className="text-base break-words text-adm-ink-2 md:text-sm">
                    {order.items.map((i) => `${i.qty}× ${i.productName}`).join(", ")}
                  </div>
                  <div className="mt-1 text-sm text-adm-ink-3 capitalize">
                    {order.payment?.method ?? "counter"} · ₱{order.totalAmount.toFixed(2)}
                    {order.payment?.status === "paid" && " · paid"}
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
    </div>
  );
}
