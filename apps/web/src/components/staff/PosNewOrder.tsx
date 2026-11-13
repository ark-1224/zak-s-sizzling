"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, ApiError } from "@/lib/api-client";
import { getSocket } from "@/lib/websocket";
import { AdmButton, Card, admInputClass, admLabelClass, admModalActionsClass, admModalBackdropClass, admModalPanelClass } from "@/components/admin/ui";
import { peso } from "./PaymentPanel";
import type { Category, OrderDTO, Product } from "@zaks/shared-types";

// The light POS's New order tab: staff ring up a walk-in customer who doesn't use the
// kiosk. Pick dishes from the menu (search, category), each with its quantity and the
// dish's own special-instruction options or a typed note, choose dine in or take out,
// then Charge: the order is placed as a counter order and the payment step opens.
// Sold-out dishes are greyed out, from the live servings (dishes) and pieces (ready-made
// items), and the menu reloads as stock changes.

const SEPARATOR = ", "; // the kiosk joins options and the note the same way
const MAX_INSTRUCTIONS = 140; // order_items.special_instructions
const MAX_QTY = 999;

interface CartLine {
  key: string;
  product: Product;
  qty: number;
  instructions: string;
}

const soldOut = (p: Product) => !p.isAvailable || (p.stockQty ?? 0) <= 0;

export function PosNewOrder({ onPlaced }: { onPlaced: (order: OrderDTO) => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [picking, setPicking] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<"dine_in" | "take_out">("dine_in");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [prods, cats] = await Promise.all([apiFetch<Product[]>("/api/products"), apiFetch<Category[]>("/api/categories")]);
      setProducts(prods);
      setCategories(cats);
      setLoadError(null);
      // Keep the cart's products current (prices, stock) with what was just loaded.
      setCart((lines) => lines.flatMap((l) => {
        const fresh = prods.find((p) => p.id === l.product.id);
        return fresh ? [{ ...l, product: fresh }] : [];
      }));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load the menu.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  // Sales, restocks and edits change what can be sold: reload the menu.
  useEffect(() => {
    const socket = getSocket();
    socket.on("inventory:updated", load);
    socket.on("categories:changed", load);
    return () => {
      socket.off("inventory:updated", load);
      socket.off("categories:changed", load);
    };
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? []).filter((p) => (categoryId === "all" || p.categoryId === categoryId) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, query, categoryId]);

  const total = cart.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const count = cart.reduce((sum, l) => sum + l.qty, 0);

  function addToCart(product: Product, qty: number, instructions: string) {
    const key = `${product.id}|${instructions}`;
    setCart((lines) => {
      const same = lines.find((l) => l.key === key);
      if (same) return lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l));
      return [...lines, { key, product, qty, instructions }];
    });
    setError(null);
  }

  function changeQty(key: string, qty: number) {
    setCart((lines) => (qty <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, qty) } : l))));
  }

  async function charge() {
    if (cart.length === 0) return;
    setPlacing(true);
    setError(null);
    try {
      const order = await apiFetch<OrderDTO>("/api/orders", {
        method: "POST",
        auth: "staff",
        body: JSON.stringify({
          orderType,
          items: cart.map((l) => ({ productId: l.product.id, qty: l.qty, specialInstructions: l.instructions || undefined })),
        }),
      });
      setCart([]);
      setOrderType("dine_in");
      onPlaced(order);
    } catch (err) {
      // A 409 means a dish ran out (or can't make this many); the menu reload shows which.
      setError(err instanceof ApiError ? err.message : "Could not place the order.");
      await load();
    } finally {
      setPlacing(false);
    }
  }

  if (loadError && !products) return <div className="text-base text-adm-bad md:text-sm">{loadError}</div>;
  if (!products) return <div className="text-adm-ink-3">Loading the menu…</div>;

  return (
    <div className="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Menu" className="flex min-w-0 flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search dishes"
          aria-label="Search dishes"
          className={`sm:max-w-80 ${admInputClass}`}
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
          {[{ id: "all" as const, name: "All", icon: null }, ...categories].map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
              className={`min-h-11 rounded-full border px-3.5 text-base md:min-h-8 md:text-sm ${
                categoryId === c.id ? "border-adm-ink bg-adm-ink text-adm-surface" : "border-adm-line bg-adm-surface text-adm-ink-2"
              }`}
            >
              {c.icon ? `${c.icon} ` : ""}
              {c.name}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <div className="p-2 text-base text-adm-ink-3 md:text-sm">No dish matches.</div>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => {
              const out = soldOut(p);
              const readyMade = p.category?.isReadyMade === true;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={out}
                    onClick={() => setPicking(p)}
                    aria-label={`${p.name}, ${peso(p.price)}${out ? ", sold out" : ""}`}
                    className="flex h-full min-h-24 w-full flex-col gap-1 rounded-[6px] border border-adm-line bg-adm-surface p-3 text-left transition-colors hover:border-adm-ink-3 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="flex items-start gap-2">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small API thumbnail
                        <img src={apiUrl(p.imageUrl)} alt="" className="h-9 w-9 shrink-0 rounded-[4px] object-cover" />
                      ) : (
                        <span aria-hidden="true" className="text-2xl leading-none">
                          {p.icon ?? "🍽️"}
                        </span>
                      )}
                      <span className="min-w-0 text-base leading-tight font-medium break-words md:text-sm">{p.name}</span>
                    </span>
                    <span className="mt-auto flex items-end justify-between gap-2">
                      <span className="font-adm-mono text-base md:text-sm">{peso(p.price)}</span>
                      <span className={`font-adm-mono text-xs ${out ? "text-adm-bad" : "text-adm-ink-3"}`}>
                        {out ? "SOLD OUT" : `${p.stockQty ?? 0} ${readyMade ? "pcs" : "left"}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card title={`Order${count ? ` · ${count} item${count !== 1 ? "s" : ""}` : ""}`}>
        <div className="flex flex-col gap-3 p-4">
          {cart.length === 0 ? (
            <p className="text-base text-adm-ink-3 md:text-sm">Tap a dish to add it.</p>
          ) : (
            <ul className="divide-y divide-adm-line-soft">
              {cart.map((l) => (
                <li key={l.key} className="flex flex-col gap-1.5 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-base font-medium break-words md:text-sm">
                      {l.product.name}
                      {l.instructions && <span className="block text-sm font-normal text-adm-ink-3">{l.instructions}</span>}
                    </span>
                    <span className="font-adm-mono shrink-0 text-base md:text-sm">{peso(l.product.price * l.qty)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <QtyButton label={`One fewer ${l.product.name}`} onClick={() => changeQty(l.key, l.qty - 1)}>
                      −
                    </QtyButton>
                    <span className="font-adm-mono w-8 text-center" aria-label={`${l.qty} ${l.product.name}`}>
                      {l.qty}
                    </span>
                    <QtyButton label={`One more ${l.product.name}`} onClick={() => changeQty(l.key, l.qty + 1)}>
                      +
                    </QtyButton>
                    <button
                      type="button"
                      onClick={() => changeQty(l.key, 0)}
                      className="ml-auto min-h-11 px-2 text-sm text-adm-ink-3 underline underline-offset-2 md:min-h-8"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div role="radiogroup" aria-label="Dine in or take out" className="grid grid-cols-2 gap-1 rounded-[6px] border border-adm-line bg-adm-bg p-1">
            {(
              [
                ["dine_in", "Dine in"],
                ["take_out", "Take out"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={orderType === value}
                onClick={() => setOrderType(value)}
                className={`min-h-11 rounded-[4px] text-base font-medium md:min-h-9 md:text-sm ${
                  orderType === value ? "bg-adm-surface text-adm-ink shadow-sm" : "text-adm-ink-3"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-base text-adm-ink-2 md:text-sm">Total</span>
            <span className="font-adm-mono text-2xl font-semibold">{peso(total)}</span>
          </div>
          {error && (
            <p role="alert" className="text-base text-adm-bad md:text-sm">
              {error}
            </p>
          )}
          <AdmButton variant="primary" size="large" disabled={cart.length === 0 || placing} onClick={charge}>
            {placing ? "Placing order…" : `Charge ${peso(total)}`}
          </AdmButton>
          {cart.length > 0 && (
            <button type="button" onClick={() => setCart([])} className="min-h-11 text-sm text-adm-ink-3 underline underline-offset-2 md:min-h-8">
              Clear order
            </button>
          )}
        </div>
      </Card>

      {picking && (
        <ItemSheet
          product={picking}
          onClose={() => setPicking(null)}
          onAdd={(qty, instructions) => {
            addToCart(picking, qty, instructions);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

function QtyButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-11 w-11 rounded-[5px] border border-adm-line text-lg font-bold text-adm-accent md:h-8 md:w-8 md:text-base"
    >
      {children}
    </button>
  );
}

/** Quantity and special instructions for one dish, like the kiosk's product sheet. */
function ItemSheet({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (qty: number, instructions: string) => void }) {
  const [qty, setQty] = useState(1);
  const [chips, setChips] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const options = product.allowInstructions === false ? [] : (product.instructionOptions ?? []);
  const instructions = [options.filter((o) => chips.includes(o)).join(SEPARATOR), note.trim()].filter(Boolean).join(SEPARATOR);
  const tooLong = instructions.length > MAX_INSTRUCTIONS;
  const left = product.stockQty ?? 0;

  return (
    <div className={admModalBackdropClass}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!tooLong) onAdd(qty, instructions);
        }}
        className={`${admModalPanelClass} max-w-md`}
        aria-labelledby="sheet-title"
      >
        <h2 id="sheet-title" className="mb-0.5 text-lg font-semibold tracking-tight break-words">
          {product.icon} {product.name}
        </h2>
        <p className="font-adm-mono mb-4 text-sm text-adm-ink-3">
          {peso(product.price)} · {left} {product.category?.isReadyMade ? "pcs" : "servings"} left
        </p>

        <span className={admLabelClass}>Quantity</span>
        <div className="mb-4 flex items-center gap-3">
          <QtyButton label="One fewer" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            −
          </QtyButton>
          <span className="font-adm-mono w-10 text-center text-xl" aria-live="polite">
            {qty}
          </span>
          <QtyButton label="One more" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}>
            +
          </QtyButton>
          {qty > left && <span className="text-sm text-adm-warn">Only {left} left</span>}
        </div>

        {product.allowInstructions !== false && (
          <>
            {options.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Special instructions">
                {options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={chips.includes(o)}
                    onClick={() => setChips((c) => (c.includes(o) ? c.filter((x) => x !== o) : [...c, o]))}
                    className={`min-h-11 rounded-full border px-3.5 text-base md:min-h-8 md:text-sm ${
                      chips.includes(o) ? "border-adm-ink bg-adm-ink text-adm-surface" : "border-adm-line bg-adm-surface text-adm-ink-2"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            <label className="mb-1 block">
              <span className={admLabelClass}>Note for the kitchen (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_INSTRUCTIONS} className={admInputClass} />
            </label>
            <p className={`mb-4 text-sm ${tooLong ? "text-adm-bad" : "text-adm-ink-3"}`}>
              {instructions.length}/{MAX_INSTRUCTIONS} characters{tooLong ? ": take something out" : ""}
            </p>
          </>
        )}

        <div className={admModalActionsClass}>
          <AdmButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </AdmButton>
          <AdmButton type="submit" variant="primary" disabled={tooLong}>
            Add {qty} · {peso(product.price * qty)}
          </AdmButton>
        </div>
      </form>
    </div>
  );
}
