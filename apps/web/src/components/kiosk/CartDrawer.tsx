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
      <div
        className={`fixed top-0 right-0 bottom-0 z-41 flex w-[400px] max-w-[92vw] flex-col bg-cream shadow-2xl transition-transform duration-220 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-6 pt-5.5 pb-4">
          <h2 className="font-display text-xl text-matcha-deep">Your order</h2>
          <button
            onClick={onClose}
            className="flex h-8.5 w-8.5 items-center justify-center rounded-full text-base font-bold text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2.5">
          {lines.length === 0 ? (
            <div className="py-15 text-center text-ink-soft">
              <div className="font-display mb-1.5 text-[19px] text-matcha-deep">Your cart is empty</div>
              <div>Browse the menu and tap an item to add it.</div>
            </div>
          ) : (
            lines.map((line) => <CartLineRow key={line.cartId} line={line} />)
          )}
        </div>

        <div className="border-t border-line px-6 pt-4.5 pb-6">
          <div className="mb-1.5 flex justify-between text-sm text-ink-soft">
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
          <div className="text-[14.5px] font-semibold">{line.name}</div>
          <div className="text-sm font-bold whitespace-nowrap text-honey">
            ₱{(line.price * line.qty).toFixed(2)}
          </div>
        </div>
        {line.instructions && (
          <div className="mt-0.75 text-xs text-ink-soft italic">&ldquo;{line.instructions}&rdquo;</div>
        )}
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex items-center overflow-hidden rounded-full border border-line bg-white">
            <button
              onClick={() => changeQty(line.cartId, -1)}
              className="h-7 w-7 text-sm font-bold text-matcha-deep"
            >
              −
            </button>
            <span className="w-6 text-center text-[13px] font-bold">{line.qty}</span>
            <button
              onClick={() => changeQty(line.cartId, 1)}
              className="h-7 w-7 text-sm font-bold text-matcha-deep"
            >
              +
            </button>
          </div>
          <button onClick={() => removeLine(line.cartId)} className="text-[12.5px] font-semibold text-berry">
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
