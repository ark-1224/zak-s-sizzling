"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { OrderDTO } from "@zaks/shared-types";

// New in Sprint 3 — lets front-desk staff find counter orders awaiting payment and
// confirm them, per the manuscript's "Billing and Payment Processing" staff requirement.
export default function StaffOrdersPage() {
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<OrderDTO[]>("/api/orders?unpaid=1", { auth: "staff" });
      setOrders(result);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConfirm(orderId: string) {
    setConfirmingId(orderId);
    try {
      await apiFetch(`/api/payments/counter/${orderId}/confirm`, { method: "POST", auth: "staff" });
      setMessage("Payment confirmed.");
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not confirm payment.");
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-cream p-8">
      <h1 className="font-display text-2xl font-semibold text-matcha-deep">Orders awaiting payment</h1>
      <p className="mt-1 mb-6 text-sm text-ink-soft">
        Counter orders show up here once placed. Confirm once the customer has paid.
      </p>

      {message && <div className="mb-4 text-sm text-matcha-deep">{message}</div>}

      {loading ? (
        <div className="text-ink-soft">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="text-ink-soft">Nothing awaiting payment right now.</div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="flex items-center justify-between rounded-xl border border-line bg-white p-4">
              <div>
                <div className="font-display font-bold text-matcha-deep">{order.orderNumber}</div>
                <div className="text-sm text-ink-soft">
                  {order.items.map((i) => `${i.qty}× ${i.productName}`).join(", ")}
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  {order.payment?.method ?? "counter"} · ₱{order.totalAmount.toFixed(2)}
                </div>
              </div>
              <button
                disabled={confirmingId === order.id}
                onClick={() => handleConfirm(order.id)}
                className="rounded-full bg-matcha px-4 py-2 text-sm font-bold text-cream disabled:opacity-60"
              >
                {confirmingId === order.id ? "Confirming…" : "Confirm payment"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
