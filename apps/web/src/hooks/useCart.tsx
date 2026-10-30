"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { OrderType, Product } from "@zaks/shared-types";

// Cart state model ported from kiosk.html's `cart[]` / `cartIdSeq` (Downloads/kiosk.html,
// lines 523-524, 707-743). Kept entirely client-side (localStorage-backed) until
// checkout submits the whole cart to POST /api/orders in one shot — this mirrors
// kiosk.html's original add/adjust/remove-then-checkout flow.
export interface CartLine {
  cartId: string;
  productId: string;
  name: string;
  price: number;
  icon: string | null;
  /** The product's photo (Product.imageUrl); missing in carts saved before photos existed. */
  imageUrl?: string | null;
  categoryName: string | undefined;
  qty: number;
  instructions: string;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  total: number;
  /** Dine in or take out, asked right after the welcome screen; null until chosen. */
  orderType: OrderType | null;
  setOrderType: (orderType: OrderType) => void;
  /** True once the saved cart has been read, so screens don't flash the welcome screen. */
  hydrated: boolean;
  addToCart: (product: Product, qty: number, instructions: string) => void;
  changeQty: (cartId: string, delta: number) => void;
  removeLine: (cartId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Instructions compared loosely, so "No onions" and " no onions " count as the same request. */
const sameInstructions = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
const STORAGE_KEY = "zaks.kiosk.cart";
const ORDER_TYPE_KEY = "zaks.kiosk.orderType";
let cartIdSeq = 1;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage once on mount (cart persists across a page refresh), on the
  // next tick like the pages' first loads, so it isn't a state update inside the effect.
  useEffect(() => {
    const first = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CartLine[];
          setLines(parsed);
          const maxId = parsed.reduce((max, l) => Math.max(max, Number(l.cartId.slice(1)) || 0), 0);
          cartIdSeq = maxId + 1;
        }
        const savedType = window.localStorage.getItem(ORDER_TYPE_KEY);
        if (savedType === "dine_in" || savedType === "take_out") setOrderType(savedType);
      } catch {
        // corrupted localStorage — start with an empty cart rather than crashing the kiosk
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => clearTimeout(first);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
      if (orderType) window.localStorage.setItem(ORDER_TYPE_KEY, orderType);
      else window.localStorage.removeItem(ORDER_TYPE_KEY);
    } catch {
      // Storage can be full or blocked; the cart still works for this visit.
    }
  }, [lines, orderType, hydrated]);

  // The same dish with the same instructions goes on one line ("2 × Sisig") instead
  // of two identical lines; different instructions keep their own line (UI review #3).
  function addToCart(product: Product, qty: number, instructions: string) {
    setLines((prev) => {
      const match = prev.find((l) => l.productId === product.id && sameInstructions(l.instructions, instructions));
      if (match) return prev.map((l) => (l === match ? { ...l, qty: l.qty + qty } : l));
      return [
        ...prev,
        {
          cartId: `c${cartIdSeq++}`,
          productId: product.id,
          name: product.name,
          price: product.price,
          icon: product.icon,
          imageUrl: product.imageUrl,
          categoryName: product.category?.name,
          qty,
          instructions: instructions.trim(),
        },
      ];
    });
  }

  function changeQty(cartId: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.cartId === cartId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }

  function removeLine(cartId: string) {
    setLines((prev) => prev.filter((l) => l.cartId !== cartId));
  }

  /** Empties the order and forgets dine in / take out, ready for the next customer. */
  function clearCart() {
    setLines([]);
    setOrderType(null);
  }

  const { count, total } = useMemo(
    () => ({
      count: lines.reduce((s, l) => s + l.qty, 0),
      total: lines.reduce((s, l) => s + l.qty * l.price, 0),
    }),
    [lines]
  );

  return (
    <CartContext.Provider
      value={{ lines, count, total, orderType, setOrderType, hydrated, addToCart, changeQty, removeLine, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
