"use client";

import type { OrderDTO } from "@zaks/shared-types";

// New in Sprint 3 — kiosk.html's checkout was a stub with no confirmation screen to
// port from. Shows the digital receipt + order number the manuscript's Payment
// Transaction requirement calls for.
interface ReceiptModalProps {
  order: OrderDTO;
  onDone: () => void;
}

const METHOD_LABEL: Record<string, string> = {
  gcash: "GCash",
  maya: "Maya",
  counter: "Pay at counter",
};

export function ReceiptModal({ order, onDone }: ReceiptModalProps) {
  const isPaid = order.payment?.status === "paid";
  // Covers true counter orders and the "online payment wasn't configured, fell back
  // to counter" path — either way, the actionable answer for the customer is the same.
  const isAwaitingPayment = !isPaid && !!order.payment;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#22301f]/55 p-3 sm:p-5">
      {/* max-h-full + overflow-y-auto: a long order used to run past the bottom of the
          screen with no way to scroll to the "Back to menu" button. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Receipt"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-card bg-cream p-5 text-center shadow-2xl sm:p-7"
      >
        <div className="mb-3 text-5xl">{isPaid ? "✅" : "🧾"}</div>
        <h2 className="font-display mb-1 text-2xl font-semibold text-matcha-deep">
          {isPaid ? "Payment received!" : "Order placed"}
        </h2>
        <p className="mb-5 text-base text-ink-soft">
          {isPaid
            ? "Your order has been sent to the kitchen."
            : isAwaitingPayment
              ? "Please pay at the counter to confirm your order."
              : "We couldn't confirm payment yet — please check with staff."}
        </p>

        <div className="mb-5 rounded-xl border border-line bg-white p-4 text-left sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
            <span className="text-sm text-ink-soft">Order number</span>
            <span className="font-display text-lg font-bold break-all text-matcha-deep">{order.orderNumber}</span>
          </div>

          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-3 py-1 text-base">
              <span className="min-w-0 break-words">
                {item.qty} × {item.productName}
              </span>
              <span className="font-semibold whitespace-nowrap">₱{item.subtotal.toFixed(2)}</span>
            </div>
          ))}

          <div className="mt-3 flex justify-between border-t border-line pt-3 text-lg font-bold">
            <span>Total</span>
            <span className="text-price-accent">₱{order.totalAmount.toFixed(2)}</span>
          </div>

          {order.payment && (
            <div className="mt-2 text-sm break-words text-ink-soft">
              Payment method: {METHOD_LABEL[order.payment.method] ?? order.payment.method}
              {isAwaitingPayment && order.payment.method !== "counter" && " (unavailable — pay at counter)"}
              {order.payment.reference && ` · Ref: ${order.payment.reference}`}
            </div>
          )}
        </div>

        <button onClick={onDone} className="w-full rounded-full bg-matcha py-3 font-bold text-cream shadow-card">
          Back to menu
        </button>
      </div>
    </div>
  );
}
