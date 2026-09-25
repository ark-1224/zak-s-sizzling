"use client";

import Link from "next/link";
import { useCart } from "@/hooks/useCart";
import { categoryBgColor } from "@/lib/categoryColors";
import { Icon } from "@/components/Icon";
import type { CartLine as CartLineType } from "@/hooks/useCart";

// Ported from kiosk.html's cart drawer (Downloads/kiosk.html, lines 295-347, 402-415,
// 751-809). renderCart()/changeCartQty()/removeCartLine() become useCart() mutations.
// Sprint 3: checkout moved to its own page (payment method selection), so this drawer
// now just links there instead of submitting the order itself.
//
// Layout: a bottom sheet on phones (slides up, nearly full height), a right-hand side
// sheet from md up (slides in from the right).
interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { lines, count, total } = useCart();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-[#22301f]/45 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      {/* The closed panel sits off-screen via translate. On its own that still counts
          toward the page's scrollable width/height on mobile browsers (the page measured
          690px wide on a 360px phone); clipping it inside a fixed, viewport-sized
          overflow-hidden box keeps the off-screen part from ever being scrollable to. */}
      <div className={`fixed inset-0 z-41 overflow-hidden ${open ? "" : "pointer-events-none"}`}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your order"
          className={`absolute inset-x-0 top-12 bottom-0 flex flex-col rounded-t-3xl bg-cream shadow-2xl transition-[transform,visibility] duration-220 md:top-0 md:left-auto md:w-96 md:rounded-none ${
            open
              ? "visible translate-y-0 md:translate-x-0"
              : "invisible translate-y-full md:translate-x-full md:translate-y-0"
          }`}
        >
          <span aria-hidden="true" className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-line md:hidden" />
          <div className="flex items-center justify-between border-b border-line py-2 pr-2 pl-5">
            <h2 className="font-display text-xl font-semibold text-matcha-deep">
              Your order{" "}
              <span className="font-sans text-base font-normal text-ink-soft">
                ({count} item{count !== 1 ? "s" : ""})
              </span>
            </h2>
            <button
              onClick={onClose}
              aria-label="Close order"
              className="flex h-12 w-12 items-center justify-center rounded-full text-ink"
            >
              <Icon name="close" className="h-6 w-6" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
            {lines.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center text-ink-soft">
                <span aria-hidden="true" className="text-5xl">
                  🛒
                </span>
                <div className="font-display mt-3 text-xl text-matcha-deep">Your order is empty</div>
                <div className="mt-1 text-base">Tap + on any dish to add it.</div>
              </div>
            ) : (
              lines.map((line) => <CartLineRow key={line.cartId} line={line} />)
            )}
          </div>

          <div
            className="border-t border-line px-5 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-baseline justify-between text-lg font-bold text-ink">
              <span>Total</span>
              <span className="text-xl">₱{total.toFixed(2)}</span>
            </div>
            {lines.length === 0 ? (
              <button disabled className="mt-3 min-h-14 w-full rounded-full bg-grey-out text-lg font-bold text-white">
                Proceed to checkout
              </button>
            ) : (
              <Link
                href="/checkout"
                onClick={onClose}
                className="mt-3 flex min-h-14 w-full items-center justify-center rounded-full bg-honey text-lg font-bold text-matcha-deep shadow-card"
              >
                Proceed to checkout
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function CartLineRow({ line }: { line: CartLineType }) {
  const { changeQty, removeLine } = useCart();

  return (
    <div className="flex gap-3 border-b border-line py-4 last:border-b-0">
      {/* Photo slot, same as the menu rows. */}
      <div
        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl text-2xl"
        style={{ background: categoryBgColor(line.categoryName) }}
        aria-hidden="true"
      >
        {line.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <div className="min-w-0 text-base font-semibold break-words">{line.name}</div>
          <div className="text-base font-bold whitespace-nowrap text-price-accent">
            ₱{(line.price * line.qty).toFixed(2)}
          </div>
        </div>
        {line.instructions && (
          <div className="mt-0.5 text-sm break-words text-ink-soft italic">&ldquo;{line.instructions}&rdquo;</div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-full border border-line bg-white">
            <button
              onClick={() => changeQty(line.cartId, -1)}
              aria-label={`Decrease ${line.name} quantity`}
              className="h-12 w-12 text-xl font-bold text-matcha-deep active:bg-paper"
            >
              −
            </button>
            <span className="w-8 text-center text-base font-bold">{line.qty}</span>
            <button
              onClick={() => changeQty(line.cartId, 1)}
              aria-label={`Increase ${line.name} quantity`}
              className="h-12 w-12 text-xl font-bold text-matcha-deep active:bg-paper"
            >
              +
            </button>
          </div>
          <button
            onClick={() => removeLine(line.cartId)}
            className="ml-auto min-h-12 px-3 text-base font-semibold text-berry"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
