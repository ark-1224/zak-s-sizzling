"use client";

import Link from "next/link";
import { useCart } from "@/hooks/useCart";
import { categoryBgColor } from "@/lib/categoryColors";
import type { CartLine as CartLineType } from "@/hooks/useCart";

// Ported from kiosk.html's cart drawer (Downloads/kiosk.html, lines 295-347, 402-415,
// 751-809). renderCart()/changeCartQty()/removeCartLine() become useCart() mutations.
// Sprint 3: checkout moved to its own page (payment method selection), so this drawer
// now just links there instead of submitting the order itself.
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
      {/* The panel slides off-screen with translate-x-full when closed. On its own that
          still counts toward the page's scrollable width on mobile browsers (the page
          measured 690px wide on a 360px phone); clipping it inside a fixed, viewport-sized
          overflow-hidden box keeps the off-screen part from ever being scrollable to. */}
      <div className={`fixed inset-0 z-41 overflow-hidden ${open ? "" : "pointer-events-none"}`}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your order"
          className={`absolute top-0 right-0 bottom-0 flex w-11/12 max-w-sm flex-col bg-cream shadow-2xl transition-[transform,visibility] duration-220 ${
            open ? "visible translate-x-0" : "invisible translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line py-3 pr-2 pl-4 sm:pl-6">
            <h2 className="font-display text-xl text-matcha-deep">Your order</h2>
            <button
              onClick={onClose}
              aria-label="Close cart"
              className="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold text-ink"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2.5 sm:px-6">
            {lines.length === 0 ? (
              <div className="py-15 text-center text-ink-soft">
                <div className="font-display mb-1.5 text-[19px] text-matcha-deep">Your cart is empty</div>
                <div>Browse the menu and tap an item to add it.</div>
              </div>
            ) : (
              lines.map((line) => <CartLineRow key={line.cartId} line={line} />)
            )}
          </div>

          <div className="border-t border-line px-4 pt-4.5 pb-6 sm:px-6">
            <div className="mb-1.5 flex justify-between text-base text-ink-soft">
              <span>Items</span>
              <span>{count}</span>
            </div>
            <div className="mt-2 flex justify-between text-lg font-bold text-ink">
              <span>Total</span>
              <span>₱{total.toFixed(2)}</span>
            </div>
            {lines.length === 0 ? (
              <button
                disabled
                className="mt-3.5 w-full rounded-full bg-grey-out py-3.75 text-base font-bold text-white"
              >
                Proceed to checkout
              </button>
            ) : (
              <Link
                href="/checkout"
                onClick={onClose}
                className="mt-3.5 block w-full rounded-full bg-honey py-3.75 text-center text-base font-bold text-matcha-deep shadow-card"
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
    <div className="flex gap-3 border-b border-line py-4">
      <div
        className="flex h-13 w-13 flex-shrink-0 items-center justify-center rounded-[12px_4px_12px_4px] text-2xl"
        style={{ background: categoryBgColor(line.categoryName) }}
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
          <div className="mt-0.75 text-sm break-words text-ink-soft italic">&ldquo;{line.instructions}&rdquo;</div>
        )}
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex items-center overflow-hidden rounded-full border border-line bg-white">
            <button
              onClick={() => changeQty(line.cartId, -1)}
              aria-label={`Decrease ${line.name} quantity`}
              className="h-11 w-11 text-base font-bold text-matcha-deep"
            >
              −
            </button>
            <span className="w-7 text-center text-base font-bold">{line.qty}</span>
            <button
              onClick={() => changeQty(line.cartId, 1)}
              aria-label={`Increase ${line.name} quantity`}
              className="h-11 w-11 text-base font-bold text-matcha-deep"
            >
              +
            </button>
          </div>
          <button onClick={() => removeLine(line.cartId)} className="min-h-11 px-2 text-sm font-semibold text-berry">
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
