"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getSocket } from "@/lib/websocket";
import { PageHeader, Card, AdmButton, StatusPill, admInputClass } from "@/components/admin/ui";
import { LoadErrorAlert } from "@/components/LoadErrorAlert";
import { formatDateTime, timeAgo } from "@/lib/time";
import { aboutMinutes } from "@/lib/prepTime";
import { PaymentPanel } from "@/components/staff/PaymentPanel";
import { CounterReceipt } from "@/components/staff/CounterReceipt";
import { PosNewOrder } from "@/components/staff/PosNewOrder";
import { PaidOrders } from "@/components/staff/PaidOrders";
import { CancelDishes, type CancelChoice } from "@/components/staff/CancelDishes";
import { peso } from "@/components/staff/PaymentPanel";
import { itemText } from "@/lib/orderItems";
import { rememberPrinterSetting } from "@/lib/receiptPrinter";
import type { OrderDTO } from "@zaks/shared-types";

// The counter's light POS, per the manuscript's "Billing and Payment Processing" staff
// requirement, in three tabs (?tab=…):
// - Queue: counter orders awaiting payment. Take payment opens the payment step: cash with
//   the change worked out, or GCash / Maya recorded with its reference number. Confirming
//   checks and deducts the stock first, so a short order is caught before the money is
//   kept (docs/design/raw-material-stock.md 3.2), then shows the receipt to print.
// - New order (?tab=new): ring up a walk-in customer (components/staff/PosNewOrder.tsx).
// - Paid orders (?tab=paid): paid orders in the kitchen, which staff can cancel with a
//   reason (the kitchen display no longer cancels; panel feedback).
// In the Queue, payments staff must sort out are listed too,
// marked NEEDS ATTENTION with the server's note on what happened and what to do: paid
// after the stock ran out or after the order was cancelled, a wrong amount, paid twice, or
// cancelled by the kitchen after being paid. Once staff have dealt with it, Mark as sorted
// out takes it off the list.
// Each order shows how long ago it was placed, and the list can be searched by order
// number (the customer reads it off their receipt screen). Cancel order asks which dishes
// to cancel (all ticked, so an abandoned order is still one more click, UI review #15):
// some of them come off the order and lower the total, all of them cancel it. The list reloads
// by itself when an order is placed, paid, edited or cancelled (orders:changed), and an
// order that arrives while the page is open is marked NEW for a minute.
const NEW_FOR_MS = 60_000;
const ONLINE_LABEL: Record<string, string> = { qrph: "QR Ph", gcash: "GCash", maya: "Maya" }; // GCash, Maya: older orders

/**
 * The customer pays at the counter unless an online payment was started: a QR Ph
 * order with no PayMongo reference never reached the payment page (for example,
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

type Tab = "queue" | "new" | "paid";

export default function StaffOrdersPage() {
  // useSearchParams needs a Suspense boundary, so the page can still be prerendered.
  return (
    <Suspense fallback={<div className="text-adm-ink-3">Loading…</div>}>
      <OrdersContent />
    </Suspense>
  );
}

function OrdersContent() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "new" || tabParam === "paid" ? tabParam : "queue";
  const showTab = (next: Tab) => router.replace(next === "queue" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  // The order being paid for, and the receipt shown once it is.
  const [paying, setPaying] = useState<OrderDTO | null>(null);
  const [receipt, setReceipt] = useState<OrderDTO | null>(null);
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  // `loaded` turns true after the first successful load and stays true, so a later
  // refresh never blanks the list; a failed load sets `loadError` instead of looking empty.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  // The order whose "Cancel order" was clicked and now asks which dishes.
  const [cancelAskId, setCancelAskId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [sortingOutId, setSortingOutId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  // When each order first appeared while the page was open; ones already there on the
  // first load aren't new.
  const [arrivedAt, setArrivedAt] = useState<Record<string, number>>({});
  const knownIds = useRef<Set<string> | null>(null);

  // The counter computer with the receipt printer is set up by opening this page once
  // with ?printer=1 (?printer=0 switches it off); Print receipt then prints on it.
  useEffect(() => {
    rememberPrinterSetting("counter");
  }, []);

  // Keep "placed X min ago" current without refetching.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<OrderDTO[]>("/api/orders?unpaid=1", { auth: "staff" });
      const known = knownIds.current;
      const fresh = known ? result.filter((o) => !known.has(o.id)).map((o) => o.id) : [];
      knownIds.current = new Set([...(known ?? []), ...result.map((o) => o.id)]);
      if (fresh.length > 0) {
        const at = Date.now();
        setArrivedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((id) => [id, at])) }));
      }
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

  // Live queue: reload whenever an order is placed, paid, edited or cancelled anywhere.
  useEffect(() => {
    const socket = getSocket();
    socket.on("orders:changed", load);
    return () => {
      socket.off("orders:changed", load);
    };
  }, [load]);

  // Letters and digits only, so "ltly9n", "ZK LTLY" and "zk-ltly9n" all find ZK-LTLY9N.
  const normalize = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const search = normalize(query);
  const shown = search ? orders.filter((o) => normalize(o.orderNumber).includes(search)) : orders;

  function handlePaid(paid: OrderDTO) {
    setPaying(null);
    setReceipt(paid);
    setMessage({ text: `${paid.orderNumber} is paid and in the kitchen.`, error: false });
    load();
  }

  /** The payment step was closed without paying: the order waits in the Queue. */
  function handleNotPaid(order: OrderDTO) {
    setPaying(null);
    // A walk-in order was just placed on New order: say where it went.
    if (tab === "new") setMessage({ text: `${order.orderNumber} is waiting in the Queue, unpaid. Take payment when the customer is ready.`, error: false });
    load();
  }

  async function handleSortedOut(order: OrderDTO, resolution?: "refunded" | "placed_again") {
    setSortingOutId(order.id);
    try {
      const saved = await apiFetch<OrderDTO>(`/api/orders/${order.id}/sorted-out`, {
        method: "POST",
        auth: "staff",
        // The note on screen, so a click made just as something new arrived is refused.
        body: JSON.stringify({ note: order.stockIssueNote, resolution }),
      });
      const refunded = saved.payment?.status === "refunded" ? " Its payment is recorded as refunded." : "";
      setMessage({ text: `${order.orderNumber} was marked as sorted out.${refunded} Its note stays in the transaction history.`, error: false });
      await load();
    } catch (err) {
      // A 409 means someone else marked it a moment ago, or a new note arrived; the
      // refreshed list shows which.
      const text = err instanceof ApiError ? err.message : "Could not mark the order as sorted out.";
      setMessage({ text: `${order.orderNumber}: ${text}`, error: true });
      await load();
    } finally {
      setSortingOutId(null);
    }
  }

  async function handleCancel(order: OrderDTO, choice: CancelChoice) {
    setCancellingId(order.id);
    try {
      const saved = await apiFetch<OrderDTO>(`/api/orders/${order.id}/cancel-items`, {
        method: "POST",
        auth: "staff",
        body: JSON.stringify({ items: choice.items }),
      });
      const dishes = choice.items.reduce((n, i) => n + i.qty, 0);
      setMessage({
        text:
          saved.status === "cancelled"
            ? `${order.orderNumber} was cancelled and removed from the queue.`
            : `${dishes} dish${dishes === 1 ? " was" : "es were"} taken off ${order.orderNumber}; the total is now ${peso(saved.totalAmount)}.`,
        error: false,
      });
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
      <PageHeader eyebrow="Billing & payment · point of sale" title="Orders awaiting payment" />

      <div role="tablist" aria-label="Counter" className="flex flex-wrap gap-1 self-start rounded-[6px] border border-adm-line bg-adm-surface p-1">
        {(
          [
            ["queue", `Queue${loaded ? ` (${orders.length})` : ""}`],
            ["new", "New order"],
            ["paid", "Paid orders"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => showTab(value)}
            className={`min-h-11 rounded-[4px] px-4 text-base font-medium transition-colors md:min-h-0 md:py-1.5 md:text-sm ${
              tab === value ? "bg-adm-ink text-adm-surface" : "text-adm-ink-2 hover:bg-adm-bg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div role="status" className={`text-base md:text-sm ${message.error ? "text-adm-bad" : "text-adm-ink"}`}>
          {message.text}
        </div>
      )}

      {tab === "new" ? (
        <PosNewOrder onPlaced={(order) => setPaying(order)} />
      ) : tab === "paid" ? (
        <PaidOrders
          onCancelled={(text) => {
            setMessage({ text, error: false });
            showTab("queue");
          }}
        />
      ) : (
      <>
      <p className="text-base text-adm-ink-2 md:text-sm">
        Counter orders show up here as soon as they are placed; the list updates by itself. <strong>Take payment</strong> checks the
        stock first, so if something has run out you can take that dish off with <strong>Cancel order</strong> before keeping the
        money. Cancel order also removes an order the customer never came back to pay for.
      </p>

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
                {shown.map((order) => {
                  // Still to be confirmed and paid at the counter, even when it needs attention
                  // (a wrong amount paid online: collect the difference, or refund and cancel).
                  // Confirming leaves the flag: Mark as sorted out settles that.
                  const awaitingPayment = order.payment?.status !== "paid" && order.status !== "cancelled";
                  // A cancelled order that was paid: staff say what became of the money.
                  const moneyToSettle = order.status === "cancelled" && order.payment?.status === "paid";
                  return (
                    <li key={order.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-adm-mono text-lg font-bold">{order.orderNumber}</span>
                          {arrivedAt[order.id] !== undefined && now - arrivedAt[order.id] < NEW_FOR_MS && (
                            <StatusPill tone="ok">NEW</StatusPill>
                          )}
                          {order.stockIssue && <StatusPill tone="bad">NEEDS ATTENTION</StatusPill>}
                          {order.status === "cancelled" && <StatusPill tone="warn">CANCELLED</StatusPill>}
                          {order.source === "counter" && <StatusPill tone="ok">WALK-IN</StatusPill>}
                        </div>
                        <div className="text-base break-words text-adm-ink-2 md:text-sm">
                          {order.items.map(itemText).join(", ")}
                        </div>
                        <div className="mt-1 text-sm text-adm-ink-3">
                          {order.orderType === "take_out" ? "Take out" : "Dine in"} · <PaymentMethodText order={order} /> · ₱
                          {order.totalAmount.toFixed(2)}
                          {order.payment?.status === "paid" && " · paid"}
                          {order.payment?.status === "refunded" && " · refunded"} ·{" "}
                          <time dateTime={order.createdAt} title={formatDateTime(order.createdAt)}>
                            placed {timeAgo(order.createdAt, now)}
                          </time>
                          {order.estimatedPrepMinutes !== null && awaitingPayment && (
                            <> · ready {order.estimatedPrepMinutes === 0 ? "right away" : `${aboutMinutes(order.estimatedPrepMinutes)} after payment`}</>
                          )}
                        </div>
                        {order.stockIssue && (
                          <div className="mt-2 rounded-[5px] border border-adm-bad bg-adm-bad-soft p-2.5 text-base text-adm-ink md:text-sm">
                            <p className="whitespace-pre-line">
                              {order.stockIssueNote ?? "Something went wrong with this order's online payment. Check it with the customer."}
                            </p>
                            {/* Once staff have refunded, substituted or collected the difference. */}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {moneyToSettle ? (
                                <>
                                  <AdmButton
                                    variant="secondary"
                                    size="compact"
                                    className="bg-adm-surface"
                                    disabled={sortingOutId === order.id}
                                    onClick={() => handleSortedOut(order, "refunded")}
                                  >
                                    {sortingOutId === order.id ? "Saving…" : "Refunded: mark as sorted out"}
                                  </AdmButton>
                                  {/* Paid after being cancelled: the kitchen's own cancels can't be placed again. */}
                                  {!order.cancelReason && (
                                    <AdmButton
                                      variant="secondary"
                                      size="compact"
                                      className="bg-adm-surface"
                                      disabled={sortingOutId === order.id}
                                      onClick={() => handleSortedOut(order, "placed_again")}
                                    >
                                      Placed again: mark as sorted out
                                    </AdmButton>
                                  )}
                                </>
                              ) : (
                                <AdmButton
                                  variant="secondary"
                                  size="compact"
                                  className="bg-adm-surface"
                                  disabled={sortingOutId === order.id}
                                  onClick={() => handleSortedOut(order)}
                                >
                                  {sortingOutId === order.id ? "Saving…" : "Mark as sorted out"}
                                </AdmButton>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {awaitingPayment &&
                        (cancelAskId === order.id ? (
                          <CancelDishes
                            order={order}
                            paid={false}
                            busy={cancellingId === order.id}
                            onConfirm={(choice) => handleCancel(order, choice)}
                            onKeep={() => setCancelAskId(null)}
                          />
                        ) : (
                          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                            <AdmButton variant="secondary" className="w-full sm:w-auto" onClick={() => setCancelAskId(order.id)}>
                              Cancel order
                            </AdmButton>
                            <AdmButton variant="primary" className="w-full sm:w-auto" onClick={() => setPaying(order)}>
                              Take payment
                            </AdmButton>
                          </div>
                        ))}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
      </>
      )}

      {paying && <PaymentPanel order={paying} onClose={() => handleNotPaid(paying)} onPaid={handlePaid} />}
      {receipt && <CounterReceipt order={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
