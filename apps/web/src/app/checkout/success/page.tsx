"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { ReceiptModal } from "@/components/kiosk/ReceiptModal";
import type { OrderDTO } from "@zaks/shared-types";

// PayMongo's success_url target (set in apps/api/src/modules/payments/service.ts).
// Not yet exercised against a live PayMongo sandbox — see the "Payments" section of
// the README for what's needed to test this for real.
function CheckoutSuccessContent() {
  const params = useSearchParams();
  const orderId = params.get("order");
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    // The webhook that flips payment status to "paid" can arrive a beat after this
    // redirect, so poll briefly rather than trusting the very first response.
    async function poll() {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const result = await apiFetch<OrderDTO>(`/api/orders/${orderId}/receipt`, { auth: "kiosk" });
          if (cancelled) return;
          setOrder(result);
          if (result.payment?.status === "paid") return;
        } catch {
          if (cancelled) return;
          setError("Could not load your order.");
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!orderId || error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-cream text-center">
        <div className="font-display text-2xl text-matcha-deep">{error ?? "No order to show"}</div>
        <Link href="/" className="rounded-full bg-matcha px-6 py-3 font-bold text-cream shadow-card">
          Back to menu
        </Link>
      </div>
    );
  }

  if (!order) {
    return <div className="flex h-screen items-center justify-center text-ink-soft">Confirming your payment…</div>;
  }

  return <ReceiptModal order={order} onDone={() => (window.location.href = "/")} />;
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-ink-soft">Loading…</div>}>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
