"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Product } from "@zaks/shared-types";

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
  categoryName: string | undefined;
  qty: number;
  instructions: string;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  total: number;
  addToCart: (product: Product, qty: number, instructions: string) => void;
  changeQty: (cartId: string, delta: number) => void;
  removeLine: (cartId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "zaks.kiosk.cart";
let cartIdSeq = 1;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage once on mount (cart persists across a page refresh).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        setLines(parsed);
        const maxId = parsed.reduce((max, l) => Math.max(max, Number(l.cartId.slice(1)) || 0), 0);
        cartIdSeq = maxId + 1;
      }
    } catch {
      // corrupted localStorage — start with an empty cart rather than crashing the kiosk
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines, hydrated]);

  function addToCart(product: Product, qty: number, instructions: string) {
    setLines((prev) => [
      ...prev,
      {
        cartId: `c${cartIdSeq++}`,
        productId: product.id,
        name: product.name,
        price: product.price,
        icon: product.icon,
        categoryName: product.category?.name,
        qty,
        instructions,
      },
    ]);
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

  function clearCart() {
    setLines([]);
  }

  const { count, total } = useMemo(
    () => ({
      count: lines.reduce((s, l) => s + l.qty, 0),
      total: lines.reduce((s, l) => s + l.qty * l.price, 0),
    }),
    [lines]
  );

  return (
    <CartContext.Provider value={{ lines, count, total, addToCart, changeQty, removeLine, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
