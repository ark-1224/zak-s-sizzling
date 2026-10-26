"use client";

import { useEffect, useState } from "react";
import type { OrderDTO } from "@zaks/shared-types";
import { apiFetch } from "@/lib/api-client";
import { Icon } from "@/components/Icon";

export interface QrCode {
  /** The QR Ph code as a data: URL. */
  imageUrl: string;
  expiresAt: string;
  /** PayMongo test mode only: the page that simulates the customer paying. */
  testUrl: string | null;
}

interface QrPaymentScreenProps {
  order: OrderDTO;
  qr: QrCode;
  /** The payment arrived; called with the order as it now stands (paid). */
  onPaid: (order: OrderDTO) => void;
  /** The code ran out; the parent resumes the idle timer. */
  onExpired: () => void;
  onNewCode: () => Promise<void>;
  onPayAtCounter: () => Promise<void>;
}

const CHECK_EVERY_MS = 3000;

function remaining(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
  return { seconds, text: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` };
}

// QR Ph shown on the kiosk's own screen (no hand-off to PayMongo's page): the customer
// scans it with any bank or e-wallet app on their phone. Every few seconds the kiosk asks
// the API whether the payment has arrived (GET /api/payments/qrph/:orderId, which also
// checks with PayMongo), and moves to the receipt as soon as it has.
export function QrPaymentScreen({ order, qr, onPaid, onExpired, onNewCode, onPayAtCounter }: QrPaymentScreenProps) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<"newCode" | "counter" | null>(null);
  const left = remaining(qr.expiresAt, now);
  const expired = left.seconds === 0;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);

  // Keeps checking a little past expiry, in case the payment was made in the last moment.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const stopAt = new Date(qr.expiresAt).getTime() + 30_000;
    async function check() {
      try {
        const latest = await apiFetch<OrderDTO>(`/api/payments/qrph/${order.id}`, { auth: "kiosk" });
        if (cancelled) return;
        if (latest.payment?.status === "paid") return onPaid(latest);
      } catch {
        // A missed check is fine; the next one tries again.
      }
      if (!cancelled && Date.now() < stopAt) timer = setTimeout(check, CHECK_EVERY_MS);
    }
    timer = setTimeout(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [order.id, qr.expiresAt, onPaid]);

  async function run(kind: "newCode" | "counter") {
    setBusy(kind);
    try {
      await (kind === "newCode" ? onNewCode() : onPayAtCounter());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex shrink-0 items-center gap-3 border-b-2 border-honey/50 bg-char px-4 py-3 text-cream sm:px-6">
        <Icon name="qr" className="h-7 w-7 text-honey" />
        <h1 className="font-display text-2xl font-extrabold">Scan to pay</h1>
        <span className="ml-auto text-base text-cream/80">
          Order <span className="font-bold text-cream">{order.orderNumber}</span>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-5 px-4 py-5 lg:flex-row lg:items-center lg:gap-10 lg:px-8">
        <div className="relative shrink-0 rounded-[28px] bg-white p-4 shadow-card">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from PayMongo */}
          <img
            src={qr.imageUrl}
            alt={`QR Ph code to pay ₱${order.totalAmount.toFixed(2)} for order ${order.orderNumber}`}
            className={`block h-auto w-[min(72vw,320px)] [image-rendering:pixelated] lg:w-[340px] ${expired ? "opacity-15" : ""}`}
          />
          {expired && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="font-display text-2xl font-extrabold text-matcha-deep">This code has expired</p>
              <button
                type="button"
                onClick={() => run("newCode")}
                disabled={busy !== null}
                className="min-h-14 rounded-full bg-matcha px-7 text-lg font-bold text-cream shadow-card disabled:opacity-60"
              >
                {busy === "newCode" ? "Getting a new code…" : "Get a new code"}
              </button>
            </div>
          )}
        </div>

        <div className="flex w-full max-w-md flex-col">
          <div className="text-base text-ink-soft">Amount to pay</div>
          <div className="font-display text-5xl leading-none font-extrabold text-ink">₱{order.totalAmount.toFixed(2)}</div>

          <ol className="mt-5 space-y-2 text-lg text-ink">
            <li>
              <b>1.</b> Open your bank or e-wallet app (GCash, Maya or any bank).
            </li>
            <li>
              <b>2.</b> Scan this QR code and confirm the payment.
            </li>
            <li>
              <b>3.</b> Stay here: your receipt appears once the payment is received.
            </li>
          </ol>

          {!expired && (
            <p role="status" className="mt-5 flex items-center gap-3 rounded-2xl bg-honey-soft/70 px-4 py-3 text-base font-semibold text-matcha-deep">
              <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-matcha motion-reduce:animate-none" aria-hidden="true" />
              Waiting for your payment… code expires in {left.text}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => run("counter")}
              disabled={busy !== null}
              className="min-h-14 flex-1 rounded-full border-2 border-matcha bg-white px-5 text-lg font-bold text-matcha disabled:opacity-60"
            >
              {busy === "counter" ? "Switching…" : "Pay at the counter instead"}
            </button>
            {/* On a phone the code can't be scanned from its own screen: save it, then pick it from the gallery in the bank app. */}
            <a
              href={qr.imageUrl}
              download={`zaks-${order.orderNumber}-qrph.png`}
              className="flex min-h-14 items-center justify-center rounded-full border-2 border-line bg-white px-5 text-lg font-bold text-ink lg:hidden"
            >
              Save QR image
            </a>
          </div>

          {qr.testUrl && (
            <a href={qr.testUrl} target="_blank" rel="noreferrer" className="mt-4 text-sm text-ink-soft underline">
              PayMongo test mode: simulate this payment
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
