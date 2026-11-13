"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getSocket } from "@/lib/websocket";
import { formatDateTime, timeAgo } from "@/lib/time";
import { AdmButton, Card, StatusPill, admInputClass, admLabelClass } from "@/components/admin/ui";
import { LoadErrorAlert } from "@/components/LoadErrorAlert";
import { CounterReceipt } from "./CounterReceipt";
import { peso } from "./PaymentPanel";
import type { KitchenTaskStatus, OrderDTO } from "@zaks/shared-types";

// The Paid orders tab: orders that are paid and in the kitchen, not yet handed over. Staff
// cancel one here, with a reason (the kitchen display no longer can, per the panel):
// dishes the kitchen hasn't started go back into stock, a started dish counts as used,
// and the order moves to the Queue as NEEDS ATTENTION until the customer is refunded.
// Each dish shows its kitchen progress, so staff can tell the customer what was made.

const CANCEL_REASONS = ["Customer left", "Ran out of an ingredient", "Order was a mistake"];
const CANCEL_REASON_MAX = 200; // orders.cancel_reason is varchar(200)
const STATUS_PILL = {
  confirmed: { tone: "warn", label: "IN THE KITCHEN" },
  preparing: { tone: "warn", label: "PREPARING" },
  ready: { tone: "ok", label: "READY" },
} as const;
const DISH_STATUS: Record<KitchenTaskStatus, string> = { pending: "not started", in_progress: "cooking", completed: "done" };
const METHOD_TEXT: Record<string, string> = { counter: "Cash", gcash: "GCash", maya: "Maya", qrph: "QR Ph" };

export function PaidOrders({ onCancelled }: { onCancelled: (message: string) => void }) {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [query, setQuery] = useState("");
  const [askId, setAskId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<OrderDTO | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    try {
      setOrders(await apiFetch<OrderDTO[]>("/api/orders?inKitchen=1", { auth: "staff" }));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "The server didn't respond. Check the connection, then try again.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  // New paid orders, the kitchen's progress, hand-overs and cancels all change this list.
  useEffect(() => {
    const socket = getSocket();
    socket.on("orders:changed", load);
    socket.on("kitchen:task_updated", load);
    return () => {
      socket.off("orders:changed", load);
      socket.off("kitchen:task_updated", load);
    };
  }, [load]);

  async function cancel(order: OrderDTO, reason: string) {
    setBusyId(order.id);
    setError(null);
    try {
      await apiFetch(`/api/kitchen/orders/${order.id}/cancel`, { method: "POST", auth: "staff", body: JSON.stringify({ reason }) });
      setAskId(null);
      onCancelled(`${order.orderNumber} was cancelled. Refund the customer ${peso(order.totalAmount)}, then mark it as sorted out in the Queue.`);
    } catch (err) {
      // A 409 means the kitchen handed it over (or it was cancelled) meanwhile; the reload shows which.
      setError(`${order.orderNumber}: ${err instanceof ApiError ? err.message : "Could not cancel the order."}`);
      setAskId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const normalize = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const search = normalize(query);
  const shown = (orders ?? []).filter((o) => !search || normalize(o.orderNumber).includes(search));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-adm-ink-2 md:text-sm">
        Paid orders the kitchen hasn&apos;t handed over yet. Cancel one if the customer leaves or a dish can&apos;t be made: dishes not
        started go back into stock, and the order moves to the Queue until you refund the customer.
      </p>
      {loadError && (
        <LoadErrorAlert
          what="the paid orders"
          detail={loadError}
          onRetry={async () => {
            setRetrying(true);
            await load();
            setRetrying(false);
          }}
          retrying={retrying}
          stale={orders !== null}
        />
      )}
      {error && (
        <p role="alert" className="text-base text-adm-bad md:text-sm">
          {error}
        </p>
      )}
      {orders === null ? (
        !loadError && <div className="text-adm-ink-3">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="text-adm-ink-3">No paid orders in the kitchen right now.</div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order number"
            aria-label="Search paid orders by order number"
            className={`font-adm-mono sm:max-w-80 ${admInputClass}`}
          />
          <Card>
            <ul className="divide-y divide-adm-line-soft">
              {shown.map((order) => {
                const pill = STATUS_PILL[order.status as keyof typeof STATUS_PILL];
                return (
                  <li key={order.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-adm-mono text-lg font-bold">{order.orderNumber}</span>
                        {pill && <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
                        {order.source === "counter" && <StatusPill tone="ok">WALK-IN</StatusPill>}
                      </div>
                      <ul className="mt-1 text-base text-adm-ink-2 md:text-sm">
                        {order.items.map((i) => (
                          <li key={i.id}>
                            {i.qty}× {i.productName}
                            {i.kitchenStatus && <span className="text-adm-ink-3"> · {DISH_STATUS[i.kitchenStatus]}</span>}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-1 text-sm text-adm-ink-3">
                        {order.orderType === "take_out" ? "Take out" : "Dine in"} · {peso(order.totalAmount)} ·{" "}
                        {METHOD_TEXT[order.payment?.method ?? ""] ?? "Paid"} ·{" "}
                        <time dateTime={order.payment?.paidAt ?? order.createdAt} title={formatDateTime(order.payment?.paidAt ?? order.createdAt)}>
                          paid {timeAgo(order.payment?.paidAt ?? order.createdAt, now)}
                        </time>
                      </div>
                    </div>
                    {askId === order.id ? (
                      <CancelPanel
                        orderNumber={order.orderNumber}
                        busy={busyId === order.id}
                        onCancel={(reason) => cancel(order, reason)}
                        onKeep={() => setAskId(null)}
                      />
                    ) : (
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <AdmButton variant="secondary" className="w-full sm:w-auto" onClick={() => setReceipt(order)}>
                          Receipt
                        </AdmButton>
                        <AdmButton variant="danger" className="w-full sm:w-auto" onClick={() => setAskId(order.id)}>
                          Cancel order
                        </AdmButton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
      {receipt && <CounterReceipt order={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

/** Asks for a reason before cancelling a paid order: a quick choice, or typed. */
function CancelPanel({ orderNumber, busy, onCancel, onKeep }: { orderNumber: string; busy: boolean; onCancel: (reason: string) => void; onKeep: () => void }) {
  const [reason, setReason] = useState("");
  const typed = reason.trim();
  return (
    <div role="group" aria-label={`Cancel ${orderNumber}?`} className="flex shrink-0 flex-col gap-2.5 rounded-[6px] border border-adm-bad bg-adm-bad-soft p-3 sm:max-w-80">
      <span className="text-base text-adm-ink md:text-sm">
        Cancel <strong className="font-adm-mono">{orderNumber}</strong>? Dishes not started go back into stock; you then refund the customer.
      </span>
      <div className="flex flex-wrap gap-2">
        {CANCEL_REASONS.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={typed === choice}
            onClick={() => setReason(choice)}
            className={`min-h-11 rounded-full border px-3 text-base md:min-h-8 md:text-sm ${
              typed === choice ? "border-adm-ink bg-adm-ink text-adm-surface" : "border-adm-line bg-adm-surface text-adm-ink-2"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>
      <label className="block">
        <span className={admLabelClass}>Reason</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={CANCEL_REASON_MAX}
          placeholder="Pick one above, or type it"
          className={`bg-adm-surface ${admInputClass}`}
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <AdmButton variant="danger" size="compact" className="bg-adm-surface" disabled={busy || !typed} onClick={() => onCancel(typed)}>
          {busy ? "Cancelling…" : "Yes, cancel order"}
        </AdmButton>
        <AdmButton variant="secondary" size="compact" disabled={busy} onClick={onKeep}>
          Keep order
        </AdmButton>
      </div>
    </div>
  );
}
