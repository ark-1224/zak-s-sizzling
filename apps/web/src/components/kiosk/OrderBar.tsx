"use client";

import Link from "next/link";
import { useCart } from "@/hooks/useCart";
import { categoryBgColor } from "@/lib/categoryColors";
import { Icon } from "@/components/Icon";
import { ProductPhoto } from "./ProductPhoto";
import { SizzlingPlate } from "./SizzlingPlate";

// The bottom of the kiosk's frame, always on screen: the order so far as a strip of
// chips (tap one to change quantities or remove it), the total, and "Review & pay". On a
// phone the strip gives way to one "N items" button that opens the same review.
interface OrderBarProps {
  onReview: () => void;
}

export function OrderBar({ onReview }: OrderBarProps) {
  const { lines, count, total } = useCart();
  const empty = lines.length === 0;

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-t border-line bg-white px-3 pt-2.5 shadow-[0_-10px_28px_-18px_rgba(42,32,24,0.45)] sm:gap-4 sm:px-4"
      style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
    >
      {empty ? (
        <div className="flex min-w-0 flex-1 items-center gap-3 text-ink-soft">
          <SizzlingPlate className="hidden h-12 w-auto shrink-0 sm:block" />
          <span className="text-base">
            <span className="font-semibold text-ink">Your order is empty.</span> Tap a dish to start.
          </span>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onReview}
            aria-label={`Your order: ${count} item${count !== 1 ? "s" : ""}, ₱${total.toFixed(2)}. Change`}
            className="flex min-h-14 min-w-0 items-center gap-2 rounded-2xl bg-paper px-2.5 text-left sm:hidden"
          >
            <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-honey px-2 text-base font-bold text-char">{count}</span>
            <span className="font-display text-xl font-extrabold whitespace-nowrap text-ink">₱{total.toFixed(2)}</span>
          </button>

          <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
            <span className="font-display shrink-0 text-lg leading-tight font-bold text-matcha-deep">
              Your
              <br />
              order
            </span>
            <ul className="kiosk-no-scrollbar kiosk-fade-end flex min-w-0 flex-1 gap-2 overflow-x-auto pr-10" aria-label={`Your order: ${count} item${count !== 1 ? "s" : ""}`}>
              {lines.map((line) => (
                <li key={line.cartId} className="shrink-0">
                  <button
                    type="button"
                    onClick={onReview}
                    aria-label={`${line.qty} × ${line.name}, ₱${(line.price * line.qty).toFixed(2)}. Change`}
                    className="flex min-h-14 max-w-56 items-center gap-2.5 rounded-2xl border border-line bg-cream py-1.5 pr-3 pl-1.5 text-left active:bg-paper"
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl" style={{ background: categoryBgColor(line.categoryName) }}>
                      <ProductPhoto imageUrl={line.imageUrl} icon={line.icon} iconClassName="text-xl" eager />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        <span className="text-matcha">{line.qty}×</span> {line.name}
                      </span>
                      <span className="block text-sm text-ink-soft">₱{(line.price * line.qty).toFixed(2)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
        <div className={`text-right ${empty ? "" : "hidden sm:block"}`}>
          <div className="text-sm text-ink-soft">Total</div>
          <div className="font-display text-2xl leading-none font-extrabold text-ink">₱{total.toFixed(2)}</div>
        </div>
        {empty ? (
          <span
            aria-disabled="true"
            className="flex min-h-14 items-center gap-2 rounded-full bg-grey-out/40 px-5 text-lg font-bold whitespace-nowrap text-ink-soft sm:px-7"
          >
            Review &amp; pay
          </span>
        ) : (
          <Link
            href="/checkout"
            className="flex min-h-14 items-center gap-1.5 rounded-full bg-matcha pr-3 pl-5 text-lg font-bold whitespace-nowrap text-cream shadow-card transition-transform active:scale-97 sm:gap-2 sm:pr-4 sm:pl-7"
          >
            Review &amp; pay
            <Icon name="chevronRight" className="h-6 w-6" />
          </Link>
        )}
      </div>
    </div>
  );
}
