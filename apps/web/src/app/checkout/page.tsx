"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/components/kiosk/Toast";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { ensureKioskSession } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api-client";
import { categoryBgColor } from "@/lib/categoryColors";
import { Icon, type IconName } from "@/components/Icon";
import { ReceiptModal } from "@/components/kiosk/ReceiptModal";
import { IdleTimeoutOverlay } from "@/components/kiosk/IdleTimeoutOverlay";
import { ProductPhoto } from "@/components/kiosk/ProductPhoto";
import { SizzlingPlate } from "@/components/kiosk/SizzlingPlate";
import type { OrderDTO, PaymentMethod, PaymentOptions, PrepEstimate } from "@zaks/shared-types";
import { aboutMinutes } from "@/lib/prepTime";

const METHODS: { id: PaymentMethod; label: string; icon: IconName; blurb: string }[] = [
  { id: "counter", label: "Pay at counter", icon: "cash", blurb: "Cash or card with staff" },
  { id: "gcash", label: "GCash", icon: "phone", blurb: "Pay online via GCash" },
  { id: "maya", label: "Maya", icon: "phone", blurb: "Pay online via Maya" },
];

// New in Sprint 3 — kiosk.html's checkout was a stub; this replaces it with a real
// payment-method selection + order submission flow.
//
// In the menu's frame: the char top bar, then from lg (the 1024px kiosk) two columns, the
// order summary on the left and, on the right in a sticky panel, payment and "Place
// order", which never scrolls out of view. Below lg it's one column with the total and
// "Place order" in a sticky bottom bar. Dine in / take out was chosen before the menu and
// goes with the order; an order saved on the device without that choice (left from before
// it was asked) is sent back to the kiosk home page to choose it.
//
// GCash and Maya stay greyed out until the server confirms online payment is set up
// (GET /api/payments/options), so a customer can't pick a method that can't work
// (UI review #2).
export default function CheckoutPage() {
  const { lines, total, clearCart, orderType, hydrated } = useCart();
  const { showToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && lines.length > 0 && !orderType) router.replace("/");
  }, [hydrated, lines.length, orderType, router]);

  const [method, setMethod] = useState<PaymentMethod>("counter");
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<OrderDTO | null>(null);
  // null while checking; if the check fails, online payment is treated as unavailable.
  const [onlineAvailable, setOnlineAvailable] = useState<boolean | null>(null);

  // Estimated preparation time for the cart, from the same formula and kitchen queue the
  // order will get. Fetched again (shortly after) whenever the cart changes; if it fails,
  // the line is simply left out.
  const [estimate, setEstimate] = useState<PrepEstimate | null>(null);
  const cartKey = lines.map((l) => `${l.productId}:${l.qty}`).join(",");
  useEffect(() => {
    if (!cartKey) return;
    let cancelled = false;
    const items = cartKey.split(",").map((entry) => {
      const [productId, qty] = entry.split(":");
      return { productId, qty: Number(qty) };
    });
    // Merge lines of the same dish (different instructions) into one count.
    const merged = Object.values(
      items.reduce<Record<string, { productId: string; qty: number }>>((acc, item) => {
        acc[item.productId] = { productId: item.productId, qty: (acc[item.productId]?.qty ?? 0) + item.qty };
        return acc;
      }, {})
    );
    const timer = setTimeout(async () => {
      try {
        await ensureKioskSession();
        const result = await apiFetch<PrepEstimate>("/api/orders/estimate", {
          method: "POST",
          auth: "kiosk",
          body: JSON.stringify({ items: merged }),
        });
        if (!cancelled) setEstimate(result);
      } catch {
        if (!cancelled) setEstimate(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cartKey]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaymentOptions>("/api/payments/options")
      .then((options) => !cancelled && setOnlineAvailable(options.online))
      .catch(() => !cancelled && setOnlineAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // The idle-timeout only ran on the kiosk home page — a customer who walked away
  // mid-checkout (stuck on payment selection, or the receipt screen after ordering)
  // left the kiosk blocked for the next customer indefinitely, with no warning and no
  // auto-reset. Applies here too now, for every state this page can be in.
  const { showWarning, stayActive } = useIdleTimer({
    onReset: () => {
      clearCart();
      window.location.href = "/";
    },
  });

  async function handlePlaceOrder() {
    if (!orderType) {
      showToast("Choose Dine in or Take out first.");
      return;
    }
    const payWith: PaymentMethod = method !== "counter" && onlineAvailable !== true ? "counter" : method;
    setPlacing(true);
    try {
      await ensureKioskSession();
      const order = await apiFetch<OrderDTO>("/api/orders", {
        method: "POST",
        auth: "kiosk",
        body: JSON.stringify({
          items: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            specialInstructions: l.instructions || undefined,
          })),
          paymentMethod: payWith,
          orderType,
        }),
      });

      if (payWith === "counter") {
        clearCart();
        setPlacedOrder(order);
        return;
      }

      try {
        const { checkoutUrl } = await apiFetch<{ checkoutUrl: string }>("/api/payments/intent", {
          method: "POST",
          auth: "kiosk",
          body: JSON.stringify({ orderId: order.id, method: payWith }),
        });
        clearCart();
        window.location.href = checkoutUrl; // hands off to PayMongo's hosted checkout
      } catch (err) {
        if (err instanceof ApiError && err.status === 501) {
          // PayMongo isn't configured yet — the order still exists, just unpaid, and the
          // server has recorded it as a counter order. Show it as one so the kiosk flow
          // doesn't dead-end.
          clearCart();
          setPlacedOrder(order.payment ? { ...order, payment: { ...order.payment, method: "counter" } } : order);
          showToast("Online payment isn't set up yet — please pay at the counter.");
        } else if (err instanceof ApiError && err.status === 429) {
          // Too many payment attempts from this kiosk for now. The order exists, unpaid,
          // and staff see it as a counter order (its online payment never started), so
          // finish the same way rather than inviting a second order.
          clearCart();
          setPlacedOrder(order.payment ? { ...order, payment: { ...order.payment, method: "counter" } } : order);
          showToast(err.message);
        } else {
          throw err;
        }
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not send your order — please try again.";
      showToast(message);
    } finally {
      setPlacing(false);
    }
  }

  if (placedOrder) {
    return (
      <>
        <ReceiptModal order={placedOrder} onDone={() => (window.location.href = "/")} />
        <IdleTimeoutOverlay show={showWarning} onStayActive={stayActive} />
      </>
    );
  }

  if (lines.length === 0) {
    return (
      <>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
          <SizzlingPlate className="h-28 w-auto" />
          <h1 className="font-display text-3xl font-extrabold text-matcha-deep">Your order is empty</h1>
          <p className="text-base text-ink-soft">Add a few dishes from the menu first.</p>
          <Link
            href="/"
            className="mt-2 flex min-h-14 items-center rounded-full bg-matcha px-8 text-lg font-bold text-cream shadow-card"
          >
            Back to menu
          </Link>
        </div>
        <IdleTimeoutOverlay show={showWarning} onStayActive={stayActive} />
      </>
    );
  }

  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  return (
    <>
      <div className="flex min-h-dvh flex-col bg-paper">
        <header className="flex shrink-0 items-center gap-3 border-b-2 border-honey/50 bg-char px-3 py-2.5 text-cream sm:px-6">
          <Link
            href="/"
            className="flex min-h-12 items-center gap-1 rounded-full bg-char-soft pr-4 pl-2 text-base font-semibold"
          >
            <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
            Menu
          </Link>
          <h1 className="font-display text-2xl font-extrabold">Review &amp; pay</h1>
          <Image
            src="/logo.jpg"
            alt="Zak's Sizzling Hub"
            width={36}
            height={36}
            className="ml-auto h-9 w-9 rounded-[50%_50%_50%_8px] object-cover"
          />
        </header>

        {/* pb-32 below lg keeps the last content clear of the sticky "Place order" bar. */}
        <div className="mx-auto w-full max-w-5xl flex-1 px-3 pt-4 pb-32 sm:px-6 lg:grid lg:grid-cols-5 lg:items-start lg:gap-6 lg:pb-6">
          <section aria-labelledby="order-heading" className="rounded-2xl bg-white p-4 shadow-card sm:p-5 lg:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="order-heading" className="font-display text-2xl font-extrabold text-matcha-deep">
                Your order{" "}
                <span className="font-sans text-base font-normal text-ink-soft">
                  ({itemCount} item{itemCount !== 1 ? "s" : ""})
                </span>
              </h2>
              <Link href="/" className="flex min-h-12 shrink-0 items-center px-2 text-base font-semibold text-matcha">
                Edit
              </Link>
            </div>
            <ul className="mt-1 divide-y divide-line">
              {lines.map((l) => (
                <li key={l.cartId} className="flex gap-3 py-3">
                  {/* Photo slot, same as the menu rows and basket. */}
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ background: categoryBgColor(l.categoryName) }}>
                    <ProductPhoto imageUrl={l.imageUrl} icon={l.icon} iconClassName="text-2xl" eager />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3 text-base">
                      <span className="min-w-0 font-semibold break-words">
                        {l.qty} × {l.name}
                      </span>
                      <span className="font-semibold whitespace-nowrap">₱{(l.price * l.qty).toFixed(2)}</span>
                    </div>
                    {l.instructions && (
                      <p className="mt-0.5 text-sm break-words text-ink-soft italic">&ldquo;{l.instructions}&rdquo;</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {estimate && (
              <p className="mt-1 border-t border-line pt-3 text-base text-ink">
                <span className="font-semibold">Estimated preparation time:</span>{" "}
                {estimate.estimatedPrepMinutes === 0
                  ? "ready as soon as you've paid"
                  : `${aboutMinutes(estimate.estimatedPrepMinutes)} after payment`}
                {estimate.estimatedPrepMinutes > 0 && estimate.ordersAhead > 0 && (
                  <span className="text-ink-soft">
                    {" "}
                    ({estimate.ordersAhead} order{estimate.ordersAhead !== 1 ? "s" : ""} ahead in the kitchen)
                  </span>
                )}
              </p>
            )}
          </section>

          <section aria-labelledby="payment-heading" className="mt-5 lg:sticky lg:top-4 lg:col-span-2 lg:mt-0">
            <h2 id="payment-heading" className="font-display text-2xl font-extrabold text-matcha-deep">
              How would you like to pay?
            </h2>
            <div role="radiogroup" aria-labelledby="payment-heading" className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {METHODS.map((m) => {
                const unavailable = m.id !== "counter" && onlineAvailable !== true;
                const selected = method === m.id && !unavailable;
                return (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={selected}
                    disabled={unavailable}
                    onClick={() => setMethod(m.id)}
                    className={`relative flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed sm:flex-col sm:items-center sm:gap-1.5 sm:px-2 sm:text-center ${
                      unavailable ? "border-line bg-line/40 opacity-60" : selected ? "border-matcha bg-white" : "border-line bg-white"
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-honey-soft text-matcha">
                      <Icon name={m.icon} className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base leading-tight font-semibold text-ink">{m.label}</span>
                      <span className="block text-sm leading-snug text-ink-soft">
                        {!unavailable ? m.blurb : onlineAvailable === null ? "Checking…" : "Not set up yet"}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 sm:absolute sm:top-2 sm:right-2 sm:h-6 sm:w-6 ${
                        selected ? "border-matcha bg-matcha text-cream" : "border-line"
                      }`}
                    >
                      {selected && <Icon name="check" className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 hidden rounded-2xl bg-white px-4 py-3 shadow-card lg:block">
              <TotalRow total={total} />
              <PlaceOrderButton placing={placing} ready={Boolean(orderType)} onClick={handlePlaceOrder} className="mt-3 w-full" />
            </div>
          </section>
        </div>

        <div
          className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-4 border-t border-line bg-white px-4 pt-3 shadow-2xl lg:hidden"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <TotalRow total={total} compact />
          <PlaceOrderButton placing={placing} ready={Boolean(orderType)} onClick={handlePlaceOrder} className="flex-1" />
        </div>
      </div>
      <IdleTimeoutOverlay show={showWarning} onStayActive={stayActive} />
    </>
  );
}

function TotalRow({ total, compact }: { total: number; compact?: boolean }) {
  return compact ? (
    <div className="shrink-0">
      <div className="text-sm text-ink-soft">Total</div>
      <div className="font-display text-2xl font-extrabold text-ink">₱{total.toFixed(2)}</div>
    </div>
  ) : (
    <div className="flex items-baseline justify-between">
      <span className="text-lg font-bold">Total</span>
      <span className="font-display text-3xl font-extrabold text-ink">₱{total.toFixed(2)}</span>
    </div>
  );
}

function PlaceOrderButton({
  placing,
  ready,
  onClick,
  className,
}: {
  placing: boolean;
  /** Dine in or take out has been chosen. */
  ready: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      disabled={placing || !ready}
      onClick={onClick}
      className={`min-h-14 rounded-full bg-matcha px-6 text-lg font-bold text-cream shadow-card transition-transform active:scale-98 disabled:bg-grey-out disabled:text-white disabled:shadow-none ${className}`}
    >
      {placing ? "Placing order…" : "Place order"}
    </button>
  );
}
