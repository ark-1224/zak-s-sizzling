"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/components/kiosk/Toast";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { ensureKioskSession } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api-client";
import { categoryBgColor } from "@/lib/categoryColors";
import { Icon } from "@/components/Icon";
import { ReceiptModal } from "@/components/kiosk/ReceiptModal";
import { IdleTimeoutOverlay } from "@/components/kiosk/IdleTimeoutOverlay";
import type { OrderDTO, PaymentMethod } from "@zaks/shared-types";

const METHODS: { id: PaymentMethod; label: string; icon: string; blurb: string }[] = [
  { id: "counter", label: "Pay at counter", icon: "💵", blurb: "Cash or card with staff" },
  { id: "gcash", label: "GCash", icon: "📱", blurb: "Pay online via GCash" },
  { id: "maya", label: "Maya", icon: "📲", blurb: "Pay online via Maya" },
];

// New in Sprint 3 — kiosk.html's checkout was a stub; this replaces it with a real
// payment-method selection + order submission flow.
//
// Layout matches the menu's delivery-app style. From lg (the 1024px kiosk) it's two
// columns: the order summary on the left, payment on the right in a sticky panel so
// "Place order" never scrolls out of view. Below lg it's one column with the total and
// "Place order" in a sticky bottom bar.
export default function CheckoutPage() {
  const { lines, total, clearCart } = useCart();
  const { showToast } = useToast();

  const [method, setMethod] = useState<PaymentMethod>("counter");
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<OrderDTO | null>(null);

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
          paymentMethod: method,
        }),
      });

      if (method === "counter") {
        clearCart();
        setPlacedOrder(order);
        return;
      }

      try {
        const { checkoutUrl } = await apiFetch<{ checkoutUrl: string }>("/api/payments/intent", {
          method: "POST",
          auth: "kiosk",
          body: JSON.stringify({ orderId: order.id, method }),
        });
        clearCart();
        window.location.href = checkoutUrl; // hands off to PayMongo's hosted checkout
      } catch (err) {
        if (err instanceof ApiError && err.status === 501) {
          // PayMongo isn't configured yet — the order still exists, just unpaid.
          // Treat it like a counter order so the kiosk flow doesn't dead-end.
          clearCart();
          setPlacedOrder(order);
          showToast("Online payment isn't set up yet — please pay at the counter.");
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
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-cream px-6 text-center">
          <span aria-hidden="true" className="text-5xl">
            🛒
          </span>
          <h1 className="font-display text-2xl text-matcha-deep">Your order is empty</h1>
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
      <div className="flex min-h-dvh flex-col bg-cream">
        <header className="flex shrink-0 items-center gap-3 bg-matcha-deep px-3 py-2.5 text-cream sm:px-6">
          <Link
            href="/"
            className="flex min-h-12 items-center gap-1 rounded-full bg-white/12 pr-4 pl-2 text-base font-semibold"
          >
            <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
            Menu
          </Link>
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Checkout</h1>
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
              <h2 id="order-heading" className="font-display text-xl font-semibold text-matcha-deep">
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
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                    style={{ background: categoryBgColor(l.categoryName) }}
                  >
                    {l.icon}
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
          </section>

          <section aria-labelledby="payment-heading" className="mt-5 lg:sticky lg:top-4 lg:col-span-2 lg:mt-0">
            <h2 id="payment-heading" className="font-display text-xl font-semibold text-matcha-deep">
              How would you like to pay?
            </h2>
            <div role="radiogroup" aria-labelledby="payment-heading" className="mt-3 space-y-2.5">
              {METHODS.map((m) => {
                const selected = method === m.id;
                return (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMethod(m.id)}
                    className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3 text-left transition-colors ${
                      selected ? "border-matcha" : "border-line"
                    }`}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {m.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-ink lg:text-lg">{m.label}</span>
                      <span className="block text-sm text-ink-soft">{m.blurb}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? "border-matcha bg-matcha text-cream" : "border-line"
                      }`}
                    >
                      {selected && <Icon name="check" className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 hidden rounded-2xl bg-white p-4 shadow-card lg:block">
              <TotalRow total={total} />
              <PlaceOrderButton placing={placing} onClick={handlePlaceOrder} className="mt-3 w-full" />
            </div>
          </section>
        </div>

        <div
          className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-4 border-t border-line bg-cream px-4 pt-3 shadow-2xl lg:hidden"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <TotalRow total={total} compact />
          <PlaceOrderButton placing={placing} onClick={handlePlaceOrder} className="flex-1" />
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
      <div className="text-xl font-bold text-price-accent">₱{total.toFixed(2)}</div>
    </div>
  ) : (
    <div className="flex items-baseline justify-between">
      <span className="text-lg font-bold">Total</span>
      <span className="text-2xl font-bold text-price-accent">₱{total.toFixed(2)}</span>
    </div>
  );
}

function PlaceOrderButton({ placing, onClick, className }: { placing: boolean; onClick: () => void; className: string }) {
  return (
    <button
      disabled={placing}
      onClick={onClick}
      className={`min-h-14 rounded-full bg-honey px-6 text-lg font-bold text-matcha-deep shadow-card transition-transform active:scale-98 disabled:bg-grey-out disabled:text-white disabled:shadow-none ${className}`}
    >
      {placing ? "Placing order…" : "Place order"}
    </button>
  );
}
