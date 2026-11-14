"use client";

import { useState } from "react";
import { AdmButton, admInputClass, admLabelClass } from "@/components/admin/ui";
import { peso } from "./PaymentPanel";
import type { KitchenTaskStatus, OrderDTO } from "@zaks/shared-types";

// Cancel order on Orders awaiting payment: staff choose which dishes, and how many of each,
// to cancel (panel feedback). Every dish starts ticked, so cancelling the whole order is
// still one click; untick what the customer keeps. Sent as POST /api/orders/:id/cancel-items.
// - Unpaid (Queue): the dishes come off the order and the total goes down.
// - Paid (Paid orders): a reason is required; dishes not started go back into stock, and
//   the amount of the cancelled dishes is flagged in the Queue for a refund.

const CANCEL_REASONS = ["Customer left", "Customer changed their mind", "Ran out of an ingredient", "Order was a mistake"];
const CANCEL_REASON_MAX = 200; // orders.cancel_reason is varchar(200)
const DISH_STATUS: Record<KitchenTaskStatus, string> = { pending: "not started", in_progress: "cooking", completed: "done" };

export interface CancelChoice {
  items: { itemId: string; qty: number }[];
  reason?: string;
  /** True when every dish left is chosen: the whole order is cancelled. */
  whole: boolean;
  /** The amount of the dishes chosen. */
  amount: number;
}

export function CancelDishes({
  order,
  paid,
  busy,
  onConfirm,
  onKeep,
}: {
  order: OrderDTO;
  paid: boolean;
  busy: boolean;
  onConfirm: (choice: CancelChoice) => void;
  onKeep: () => void;
}) {
  const lines = order.items.filter((i) => i.qty > 0);
  // How many of each line to cancel; 0 = kept.
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((i) => [i.id, i.qty])));
  const [reason, setReason] = useState("");
  const typed = reason.trim();

  const chosen = lines.filter((i) => (counts[i.id] ?? 0) > 0).map((i) => ({ itemId: i.id, qty: counts[i.id], unitPrice: i.unitPrice }));
  const whole = lines.length > 0 && lines.every((i) => counts[i.id] === i.qty);
  const dishCount = chosen.reduce((n, c) => n + c.qty, 0);
  const amount = chosen.reduce((sum, c) => sum + c.qty * c.unitPrice, 0);
  const set = (id: string, n: number) => setCounts((current) => ({ ...current, [id]: n }));

  const confirmLabel = whole ? "Yes, cancel order" : `Yes, cancel ${dishCount} dish${dishCount === 1 ? "" : "es"}`;

  return (
    <div
      role="group"
      aria-label={`Cancel dishes of ${order.orderNumber}`}
      className="flex shrink-0 flex-col gap-2.5 rounded-[6px] border border-adm-bad bg-adm-bad-soft p-3 sm:w-96"
    >
      <span className="text-base text-adm-ink md:text-sm">
        Cancel which dishes of <strong className="font-adm-mono">{order.orderNumber}</strong>? Untick what the customer keeps.
      </span>
      <ul className="flex flex-col gap-1.5">
        {lines.map((i) => {
          const n = counts[i.id] ?? 0;
          return (
            <li key={i.id} className="flex items-center gap-2 rounded-[5px] bg-adm-surface px-2 py-1.5">
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-base md:min-h-8 md:text-sm">
                <input type="checkbox" checked={n > 0} onChange={(e) => set(i.id, e.target.checked ? i.qty : 0)} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  {i.productName}
                  {paid && i.kitchenStatus && <span className="text-adm-ink-3"> · {DISH_STATUS[i.kitchenStatus]}</span>}
                </span>
              </label>
              {i.qty > 1 ? (
                <span className="flex shrink-0 items-center gap-1" aria-label={`How many ${i.productName} to cancel`}>
                  <button
                    type="button"
                    aria-label={`One fewer ${i.productName}`}
                    disabled={n === 0}
                    onClick={() => set(i.id, n - 1)}
                    className="h-11 w-11 rounded-[4px] border border-adm-line text-lg disabled:opacity-40 md:h-8 md:w-8"
                  >
                    −
                  </button>
                  <span className="font-adm-mono w-14 text-center text-sm">
                    {n} of {i.qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`One more ${i.productName}`}
                    disabled={n === i.qty}
                    onClick={() => set(i.id, n + 1)}
                    className="h-11 w-11 rounded-[4px] border border-adm-line text-lg disabled:opacity-40 md:h-8 md:w-8"
                  >
                    +
                  </button>
                </span>
              ) : (
                <span className="font-adm-mono shrink-0 text-sm text-adm-ink-3">1×</span>
              )}
            </li>
          );
        })}
      </ul>
      <span className="text-base text-adm-ink md:text-sm">
        {dishCount === 0
          ? "Tick at least one dish."
          : whole
            ? paid
              ? `The whole order is cancelled. Dishes not started go back into stock; refund the customer ${peso(order.totalAmount)}.`
              : "The whole order is cancelled and leaves the queue."
            : paid
              ? `Dishes not started go back into stock; refund the customer ${peso(amount)}. The rest stays in the kitchen.`
              : `The total goes down by ${peso(amount)}, to ${peso(order.totalAmount - amount)}.`}
      </span>
      {paid && (
        <>
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
        </>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <AdmButton
          variant="danger"
          size="compact"
          className="bg-adm-surface"
          disabled={busy || dishCount === 0 || (paid && !typed)}
          onClick={() => onConfirm({ items: chosen.map(({ itemId, qty }) => ({ itemId, qty })), reason: paid ? typed : undefined, whole, amount })}
        >
          {busy ? "Cancelling…" : confirmLabel}
        </AdmButton>
        <AdmButton variant="secondary" size="compact" disabled={busy} onClick={onKeep}>
          Keep order
        </AdmButton>
      </div>
    </div>
  );
}
