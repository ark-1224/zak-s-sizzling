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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#22301f]/55 p-5">
      <div className="w-full max-w-md rounded-card bg-cream p-7 text-center shadow-2xl">
        <div className="mb-3 text-5xl">{isPaid ? "✅" : "🧾"}</div>
        <h2 className="font-display mb-1 text-2xl font-semibold text-matcha-deep">
          {isPaid ? "Payment received!" : "Order placed"}
        </h2>
        <p className="mb-5 text-sm text-ink-soft">
          {isPaid
            ? "Your order has been sent to the kitchen."
            : isAwaitingPayment
              ? "Please pay at the counter to confirm your order."
              : "We couldn't confirm payment yet — please check with staff."}
        </p>

        <div className="mb-5 rounded-xl border border-line bg-white p-5 text-left">
          <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
            <span className="text-xs text-ink-soft">Order number</span>
            <span className="font-display text-lg font-bold text-matcha-deep">{order.orderNumber}</span>
          </div>

          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between py-1 text-sm">
              <span>
                {item.qty} × {item.productName}
              </span>
              <span className="font-semibold">₱{item.subtotal.toFixed(2)}</span>
            </div>
          ))}

          <div className="mt-3 flex justify-between border-t border-line pt-3 text-base font-bold">
            <span>Total</span>
            <span className="text-honey">₱{order.totalAmount.toFixed(2)}</span>
          </div>

          {order.payment && (
            <div className="mt-2 text-xs text-ink-soft">
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
