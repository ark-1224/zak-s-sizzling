"use client";

import type { OrderDTO } from "@zaks/shared-types";
import { aboutMinutes, clockTime } from "@/lib/prepTime";
import { Icon } from "@/components/Icon";
import { SizzlingPlate } from "./SizzlingPlate";

// New in Sprint 3 — kiosk.html's checkout was a stub with no confirmation screen to
// port from. Shows the digital receipt + order number the manuscript's Payment
// Transaction requirement calls for.
export type PrintStatus = "printing" | "printed" | "failed";

interface ReceiptModalProps {
  order: OrderDTO;
  onDone: () => void;
  /** On the in-store kiosk, how printing the paper receipt went (lib/receiptPrinter.ts). */
  printStatus?: PrintStatus | null;
}

const PRINT_MESSAGE: Record<PrintStatus, string> = {
  printing: "Printing your receipt…",
  printed: "Take your printed receipt below.",
  failed: "We couldn't print your receipt. Please show this screen at the counter.",
};

const METHOD_LABEL: Record<string, string> = {
  qrph: "QR Ph",
  // Older orders only.
  gcash: "GCash",
  maya: "Maya",
  counter: "Pay at counter",
};

export function ReceiptModal({ order, onDone, printStatus = null }: ReceiptModalProps) {
  const isPaid = order.payment?.status === "paid";
  // Covers true counter orders and the "online payment wasn't configured, fell back
  // to counter" path — either way, the actionable answer for the customer is the same.
  const isAwaitingPayment = !isPaid && !!order.payment;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-char/60 p-3 sm:p-5">
      {/* max-h-full + overflow-y-auto: a long order used to run past the bottom of the
          screen with no way to scroll to the "Done" button. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Receipt"
        className="kiosk-scroll max-h-full w-full max-w-md overflow-y-auto rounded-[28px] bg-cream p-5 text-center shadow-2xl sm:p-7 lg:grid lg:max-w-4xl lg:grid-cols-2 lg:gap-6 lg:text-left"
      >
        {/* From lg (the 1024×600 kiosk) two columns, so "Done" is on screen without scrolling. */}
        <div>
          <h2 className="font-display mb-1 text-3xl font-extrabold tracking-[-0.02em] text-matcha-deep">
            {isPaid ? "Payment received!" : "Order placed"}
          </h2>
          <p className="mb-4 text-base text-ink-soft">
            {isPaid
              ? "Your order has been sent to the kitchen."
              : isAwaitingPayment
                ? "Please pay at the counter to confirm your order."
                : "We couldn't confirm payment yet — please check with staff."}
          </p>

          {/* The number the staff will call, as large as the screen allows. */}
          <div className="relative mb-4 overflow-hidden rounded-[22px] bg-char px-4 py-4 text-cream">
            <SizzlingPlate className="pointer-events-none absolute -right-6 -bottom-4 hidden h-24 w-auto opacity-90 lg:block" />
            <div className="text-base text-cream/80">Your order number</div>
            <div className="font-display mt-1 text-5xl leading-none font-extrabold tracking-[-0.01em] break-all text-honey">
              {order.orderNumber}
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-char-soft px-3 py-1.5 text-base font-semibold">
              <Icon name={order.orderType === "take_out" ? "takeOut" : "dineIn"} className="h-5 w-5 text-honey" />
              {order.orderType === "take_out" ? "Take out" : "Dine in"}
            </div>
          </div>

          <PrepTime order={order} isPaid={isPaid} />
        </div>

        <div className="flex flex-col">
          <div className="kiosk-scroll mb-5 rounded-xl border border-line bg-white p-4 text-left sm:p-5 lg:mb-4 lg:max-h-[19rem] lg:overflow-y-auto">
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
              <span className="font-display text-xl font-extrabold">₱{order.totalAmount.toFixed(2)}</span>
            </div>

            {order.payment && (
              <div className="mt-2 text-sm break-words text-ink-soft">
                Payment method: {METHOD_LABEL[order.payment.method] ?? order.payment.method}
                {isAwaitingPayment && order.payment.method !== "counter" && " (unavailable — pay at counter)"}
                {order.payment.reference && ` · Ref: ${order.payment.reference}`}
              </div>
            )}
          </div>

          {printStatus && (
            <p
              role="status"
              className={`mb-3 text-base font-semibold lg:mt-auto lg:mb-3 ${printStatus === "failed" ? "text-berry" : "text-matcha-deep"}`}
            >
              {PRINT_MESSAGE[printStatus]}
            </p>
          )}
          <button
            onClick={onDone}
            className={`min-h-14 w-full rounded-full bg-matcha text-lg font-bold text-cream shadow-card ${printStatus ? "" : "lg:mt-auto"}`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Estimated preparation time (Scope, Payment Transaction). A paid order is in the kitchen
// and has a ready time; an unpaid one is told how long it takes once paid.
function PrepTime({ order, isPaid }: { order: OrderDTO; isPaid: boolean }) {
  const minutes = order.estimatedPrepMinutes;
  if (minutes === null) return null;

  let headline: string;
  let detail: string | null = null;
  if (isPaid && order.estimatedReadyAt) {
    headline = minutes === 0 ? "Ready right away" : `Ready at about ${clockTime(order.estimatedReadyAt)}`;
    if (minutes > 0) detail = `In ${aboutMinutes(minutes)}. We'll call your order number.`;
  } else {
    headline = minutes === 0 ? "Ready as soon as you've paid" : `Ready ${aboutMinutes(minutes)} after you pay`;
  }

  return (
    <div className="mb-5 rounded-xl bg-honey-soft/70 px-4 py-3 text-left">
      <div className="text-sm text-ink-soft">Estimated preparation time</div>
      <div className="font-display text-lg font-semibold text-matcha-deep">{headline}</div>
      {detail && <div className="text-sm text-ink-soft">{detail}</div>}
    </div>
  );
}
