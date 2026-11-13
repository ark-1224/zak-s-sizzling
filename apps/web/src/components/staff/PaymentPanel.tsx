"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdmButton, admInputClass, admLabelClass, admModalActionsClass, admModalBackdropClass, admModalPanelClass } from "@/components/admin/ui";
import type { OrderDTO } from "@zaks/shared-types";

// The light POS's payment step (Orders awaiting payment): staff take the money for a
// counter order. Cash shows the change for what the customer hands over; GCash and Maya
// are paid to the shop's own account and recorded with the reference number from the
// customer's phone. Confirming checks the stock and sends the order to the kitchen in one
// step: if something has run out, nothing is saved, so hand the money back and change the
// order with the customer.

export type PayMethod = "cash" | "gcash" | "maya";
const METHOD_LABEL: Record<PayMethod, string> = { cash: "Cash", gcash: "GCash", maya: "Maya" };

export const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Exact amount, then the next round amounts a customer is likely to hand over. */
function quickAmounts(total: number): number[] {
  const steps = [20, 50, 100, 500, 1000];
  const options = [total, ...steps.map((s) => Math.ceil(total / s) * s), 500, 1000];
  return [...new Set(options.filter((n) => n >= total))].sort((a, b) => a - b).slice(0, 5);
}

export function PaymentPanel({
  order,
  onClose,
  onPaid,
}: {
  order: OrderDTO;
  /** Closed without paying: the order stays in the queue, unpaid. */
  onClose: () => void;
  /** Paid: the order as saved, and the cash handed over (cash only). */
  onPaid: (paid: OrderDTO) => void;
}) {
  const total = order.totalAmount;
  const [method, setMethod] = useState<PayMethod>("cash");
  const [cashText, setCashText] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cash = cashText.trim() === "" ? null : Number(cashText);
  const cashValid = cash !== null && Number.isFinite(cash) && cash >= total;
  const change = cashValid ? Math.round((cash! - total) * 100) / 100 : null;
  const refValid = reference.trim().length >= 4;
  const canPay = !saving && (method === "cash" ? cashValid : refValid);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!canPay) return;
    setSaving(true);
    setError(null);
    try {
      const body = method === "cash" ? { method, amountTendered: cash } : { method, reference: reference.trim() };
      const paid = await apiFetch<OrderDTO>(`/api/payments/counter/${order.id}/confirm`, { method: "POST", auth: "staff", body: JSON.stringify(body) });
      onPaid(paid);
    } catch (err) {
      // A 409 is usually a shortage: nothing was deducted and the order is still unpaid.
      const text = err instanceof ApiError ? err.message : "Could not take the payment.";
      setError(err instanceof ApiError && err.status === 409 && !/reference/i.test(text) ? `${text} Hand the money back and change the order with the customer.` : text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={admModalBackdropClass}>
      <form onSubmit={pay} className={`${admModalPanelClass} max-w-md`} aria-labelledby="pay-title">
        <div className="font-adm-mono mb-1 text-xs tracking-[.14em] text-adm-ink-3 uppercase">Take payment</div>
        <h2 id="pay-title" className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-lg font-semibold tracking-tight">
          <span className="font-adm-mono">{order.orderNumber}</span>
          <span className="font-adm-mono text-2xl">{peso(total)}</span>
        </h2>
        <p className="mb-4 text-sm break-words text-adm-ink-3">
          {order.items.map((i) => `${i.qty}× ${i.productName}`).join(", ")} · {order.orderType === "take_out" ? "Take out" : "Dine in"}
        </p>

        <div role="radiogroup" aria-label="Payment method" className="mb-4 grid grid-cols-3 gap-1 rounded-[6px] border border-adm-line bg-adm-bg p-1">
          {(["cash", "gcash", "maya"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => {
                setMethod(m);
                setError(null);
              }}
              className={`min-h-11 rounded-[4px] text-base font-medium md:min-h-9 md:text-sm ${
                method === m ? "bg-adm-surface text-adm-ink shadow-sm" : "text-adm-ink-3"
              }`}
            >
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>

        {method === "cash" ? (
          <>
            <label className="mb-2 block">
              <span className={admLabelClass}>Cash received</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                autoFocus
                value={cashText}
                onChange={(e) => setCashText(e.target.value)}
                aria-invalid={cash !== null && !cashValid ? true : undefined}
                aria-describedby="pay-cash-hint"
                className={`font-adm-mono text-lg ${admInputClass}`}
              />
            </label>
            <div className="mb-3 flex flex-wrap gap-2" aria-label="Quick amounts">
              {quickAmounts(total).map((n, i) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCashText(String(n))}
                  className="font-adm-mono min-h-11 rounded-full border border-adm-line bg-adm-surface px-3.5 text-base text-adm-ink-2 md:min-h-8 md:text-sm"
                >
                  {i === 0 && n === total ? "Exact" : peso(n).replace(".00", "")}
                </button>
              ))}
            </div>
            <div id="pay-cash-hint" className="mb-4 flex items-center justify-between rounded-[6px] border border-adm-line-soft bg-adm-bg p-3" aria-live="polite">
              <span className="text-base text-adm-ink-2 md:text-sm">Change</span>
              <span className={`font-adm-mono text-xl font-semibold ${change === null ? "text-adm-ink-3" : "text-adm-ok"}`}>
                {change === null ? (cash !== null && cash < total ? `${peso(total - cash)} short` : "—") : peso(change)}
              </span>
            </div>
          </>
        ) : (
          <label className="mb-4 block">
            <span className={admLabelClass}>{METHOD_LABEL[method]} reference number</span>
            <input
              autoFocus
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={100}
              placeholder="From the customer's payment confirmation"
              aria-describedby="pay-ref-hint"
              className={`font-adm-mono ${admInputClass}`}
            />
            <span id="pay-ref-hint" className="mt-1.5 block text-sm text-adm-ink-3">
              Check that {peso(total)} reached the shop&apos;s {METHOD_LABEL[method]} account before confirming.
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="mb-3 text-base text-adm-bad md:text-sm">
            {error}
          </p>
        )}

        <div className={admModalActionsClass}>
          <AdmButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Not now
          </AdmButton>
          <AdmButton type="submit" variant="primary" disabled={!canPay}>
            {saving ? "Checking stock…" : `Confirm ${METHOD_LABEL[method].toLowerCase()} payment`}
          </AdmButton>
        </div>
      </form>
    </div>
  );
}
