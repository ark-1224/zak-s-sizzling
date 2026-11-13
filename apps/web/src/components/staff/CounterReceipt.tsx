"use client";

import { AdmButton, admModalActionsClass, admModalBackdropClass, admModalPanelClass } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/time";
import { clockTime } from "@/lib/prepTime";
import { peso } from "./PaymentPanel";
import type { OrderDTO } from "@zaks/shared-types";

// The receipt for a payment taken at the counter (the light POS): shown on screen, and
// printed through the counter computer's own printer with the browser's Print. The
// thermal printers belong to the kiosk and the kitchen, so they aren't used here.

const METHOD_TEXT: Record<string, string> = { counter: "Cash", gcash: "GCash", maya: "Maya", qrph: "QR Ph" };

interface ReceiptLines {
  rows: { label: string; value: string; bold?: boolean }[];
  readyAt: string | null;
}

function paymentRows(order: OrderDTO): ReceiptLines {
  const p = order.payment;
  const rows: ReceiptLines["rows"] = [{ label: "TOTAL", value: peso(order.totalAmount), bold: true }];
  if (p) {
    rows.push({ label: "Paid by", value: METHOD_TEXT[p.method] ?? p.method });
    if (p.method === "counter" && p.amountTendered !== null) {
      rows.push({ label: "Cash received", value: peso(p.amountTendered) });
      rows.push({ label: "Change", value: peso(Math.max(0, p.amountTendered - order.totalAmount)) });
    }
    if (p.reference && p.method !== "qrph") rows.push({ label: "Reference no.", value: p.reference });
  }
  return { rows, readyAt: order.estimatedReadyAt && order.estimatedPrepMinutes ? clockTime(order.estimatedReadyAt) : null };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Opens the receipt in a small window sized for a receipt and asks the browser to print it. */
function printReceipt(order: OrderDTO) {
  const { rows, readyAt } = paymentRows(order);
  const when = formatDateTime(order.payment?.paidAt ?? order.createdAt);
  const items = order.items
    .map(
      (i) =>
        `<tr><td>${i.qty}× ${escapeHtml(i.productName)}${i.specialInstructions ? `<div class="note">${escapeHtml(i.specialInstructions)}</div>` : ""}</td><td class="r">${peso(i.subtotal)}</td></tr>`
    )
    .join("");
  const totals = rows.map((r) => `<tr class="${r.bold ? "b" : ""}"><td>${escapeHtml(r.label)}</td><td class="r">${escapeHtml(r.value)}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${order.orderNumber}</title>
<style>
  @page { margin: 6mm; }
  body { font-family: monospace; font-size: 12px; color: #000; margin: 0; width: 72mm; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; vertical-align: top; }
  .no { font-size: 20px; font-weight: bold; text-align: center; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; vertical-align: top; }
  .note { font-size: 11px; padding-left: 10px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; } .b td { font-weight: bold; font-size: 14px; }
</style></head><body>
<h1>Zak's Sizzling Hub</h1>
<div class="c">${escapeHtml(when)}</div>
<div class="no">${order.orderNumber}</div>
<div class="c">${order.orderType === "take_out" ? "TAKE OUT" : "DINE IN"}</div>
<hr><table>${items}</table><hr><table>${totals}</table><hr>
<div class="c">PAID${readyAt ? ` · Ready at about ${escapeHtml(readyAt)}` : ""}</div>
<div class="c">Thank you!</div>
</body></html>`;
  // A hidden frame holding only the receipt (every value above is escaped), printed once it loads.
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

export function CounterReceipt({ order, onClose }: { order: OrderDTO; onClose: () => void }) {
  const { rows, readyAt } = paymentRows(order);
  return (
    <div className={admModalBackdropClass}>
      <div role="dialog" aria-modal="true" aria-labelledby="receipt-title" className={`${admModalPanelClass} max-w-sm`}>
        <div className="font-adm-mono mb-1 text-center text-xs tracking-[.14em] text-adm-ink-3 uppercase">Receipt · paid</div>
        <h2 id="receipt-title" className="font-adm-mono mb-0.5 text-center text-2xl font-bold tracking-tight">
          {order.orderNumber}
        </h2>
        <p className="mb-4 text-center text-sm text-adm-ink-3">
          {formatDateTime(order.payment?.paidAt ?? order.createdAt)} · {order.orderType === "take_out" ? "Take out" : "Dine in"}
        </p>
        <ul className="mb-3 divide-y divide-adm-line-soft border-y border-adm-line-soft">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2 text-base md:text-sm">
              <span className="min-w-0">
                {i.qty}× {i.productName}
                {i.specialInstructions && <span className="block text-sm text-adm-ink-3">{i.specialInstructions}</span>}
              </span>
              <span className="font-adm-mono shrink-0">{peso(i.subtotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mb-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className={r.bold ? "text-base font-semibold" : "text-base text-adm-ink-2 md:text-sm"}>{r.label}</dt>
              <dd className={`font-adm-mono text-right ${r.bold ? "text-lg font-semibold" : "text-base md:text-sm"}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
        {readyAt && (
          <p className="mb-4 rounded-[6px] bg-adm-ok-soft p-3 text-center text-base text-adm-ink md:text-sm">
            Sent to the kitchen. Tell the customer it will be ready at about <strong>{readyAt}</strong>.
          </p>
        )}
        <div className={admModalActionsClass}>
          <AdmButton type="button" variant="secondary" onClick={onClose}>
            Done
          </AdmButton>
          <AdmButton type="button" variant="primary" onClick={() => printReceipt(order)}>
            Print receipt
          </AdmButton>
        </div>
      </div>
    </div>
  );
}
