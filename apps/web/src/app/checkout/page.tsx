"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/components/kiosk/Toast";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { ensureKioskSession } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api-client";
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
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-cream text-center">
          <div className="font-display text-2xl text-matcha-deep">Your cart is empty</div>
          <Link href="/" className="rounded-full bg-matcha px-6 py-3 font-bold text-cream shadow-card">
            Back to menu
          </Link>
        </div>
        <IdleTimeoutOverlay show={showWarning} onStayActive={stayActive} />
      </>
    );
  }

  return (
    <>
      <div className="mx-auto min-h-screen max-w-lg bg-cream px-6 py-8">
        <Link href="/" className="mb-6 inline-block text-sm text-ink-soft">
          ← Back to menu
        </Link>
        <h1 className="font-display mb-6 text-2xl font-semibold text-matcha-deep">Checkout</h1>

        <div className="mb-6 rounded-xl border border-line bg-white p-5">
          {lines.map((l) => (
            <div key={l.cartId} className="flex justify-between py-1.5 text-sm">
              <span>
                {l.qty} × {l.name}
              </span>
              <span className="font-semibold">₱{(l.price * l.qty).toFixed(2)}</span>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-lg font-bold">
            <span>Total</span>
            <span className="text-honey">₱{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="mb-6 space-y-2.5">
          {METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
                method === m.id ? "border-matcha bg-available/8" : "border-line bg-white"
              }`}
            >
              <span className="text-2xl">{m.icon}</span>
              <span>
                <span className="block font-semibold text-ink">{m.label}</span>
                <span className="block text-xs text-ink-soft">{m.blurb}</span>
              </span>
            </button>
          ))}
        </div>

        <button
          disabled={placing}
          onClick={handlePlaceOrder}
          className="w-full rounded-full bg-honey py-4 text-base font-bold text-matcha-deep shadow-card disabled:bg-grey-out disabled:text-white disabled:shadow-none"
        >
          {placing ? "Placing order…" : `Place order — ₱${total.toFixed(2)}`}
        </button>
      </div>
      <IdleTimeoutOverlay show={showWarning} onStayActive={stayActive} />
    </>
  );
}
