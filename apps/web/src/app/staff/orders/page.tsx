"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PageHeader, Card, AdmButton } from "@/components/admin/ui";
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
    <div className="flex flex-col gap-4.5">
      <div>
        <PageHeader eyebrow="Billing & payment" title="Orders awaiting payment" />
        <p className="text-base text-adm-ink-2 md:text-sm">
          Counter orders show up here once placed. Confirm once the customer has paid.
        </p>
      </div>

      {message && <div className="text-base text-adm-ink md:text-sm">{message}</div>}

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
                  <div className="font-adm-mono text-lg font-bold">{order.orderNumber}</div>
                  <div className="text-base break-words text-adm-ink-2 md:text-sm">
                    {order.items.map((i) => `${i.qty}× ${i.productName}`).join(", ")}
                  </div>
                  <div className="mt-1 text-sm text-adm-ink-3 capitalize">
                    {order.payment?.method ?? "counter"} · ₱{order.totalAmount.toFixed(2)}
                  </div>
                </div>
                <AdmButton
                  variant="primary"
                  className="w-full shrink-0 sm:w-auto"
                  disabled={confirmingId === order.id}
                  onClick={() => handleConfirm(order.id)}
                >
                  {confirmingId === order.id ? "Confirming…" : "Confirm payment"}
                </AdmButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
