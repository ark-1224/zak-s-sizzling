"use client";

import { useState } from "react";
import type { Product } from "@zaks/shared-types";
import { categoryBgColor } from "@/lib/categoryColors";
import { useCart } from "@/hooks/useCart";
import { useToast } from "./Toast";
import { QtyStepper } from "./QtyStepper";
import { NutritionGrid } from "./NutritionGrid";

// Ported from kiosk.html's product modal (Downloads/kiosk.html, lines 200-293, 398-400,
// 610-700). `modalQty` (a module-level variable in kiosk.html) becomes local useState.
// Add-to-cart wired to useCart() in Sprint 2.
interface ProductModalProps {
  product: Product;
  onClose: () => void;
}

export function ProductModal({ product, onClose }: ProductModalProps) {
  const [qty, setQty] = useState(1);
  const [instructions, setInstructions] = useState("");
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const out = !product.isAvailable;

  function handleAddToCart() {
    addToCart(product, qty, instructions.trim());
    onClose();
    showToast(`Added ${qty} × ${product.name} to your order`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#22301f]/55 p-5"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[88vh] w-full max-w-[680px] overflow-y-auto rounded-[26px_10px_26px_10px] bg-cream shadow-2xl">
        <div
          className="relative flex h-[170px] items-center justify-center text-7xl"
          style={{ background: categoryBgColor(product.category?.name) }}
        >
          {product.icon}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 flex h-8.5 w-8.5 items-center justify-center rounded-full bg-white/85 text-base font-bold text-ink"
          >
            ✕
          </button>
        </div>

        <div className="px-6.5 pt-5.5 pb-6.5">
          <div className="mb-1.5 flex items-start justify-between gap-3.5">
            <div className="font-display text-2xl font-semibold text-matcha-deep">{product.name}</div>
            <div className="text-xl font-bold whitespace-nowrap text-honey">₱{product.price.toFixed(2)}</div>
          </div>

          <div
            className={`mb-3.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${
              out ? "bg-grey-out/18 text-grey-out" : "bg-available/14 text-available"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {out ? "Currently unavailable" : "In stock"}
          </div>

          <p className="mb-4.5 text-[14.5px] leading-relaxed text-ink-soft">{product.description}</p>

          <Section label="Ingredients">
            <TagList items={product.ingredients} />
          </Section>

          {product.allergens.length > 0 && (
            <Section label="Allergens">
              <TagList items={product.allergens} allergen />
            </Section>
          )}

          <Section label="Nutrition (per serving)">
            <NutritionGrid nutrition={product.nutrition} />
          </Section>

          <Section label="Special instructions">
            <textarea
              placeholder="e.g. no onions, extra spicy, well done..."
              maxLength={140}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={out}
              className="min-h-14 w-full resize-none rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none focus:border-matcha disabled:bg-white/60"
            />
            <div className="mt-1.5 text-[11.5px] text-ink-soft">
              Sent directly to the kitchen display with your order.
            </div>
          </Section>

          <div className="mt-5.5 flex items-center gap-4 border-t border-line pt-4.5">
            <QtyStepper qty={qty} onChange={setQty} disabled={out} />
            <button
              disabled={out}
              onClick={handleAddToCart}
              className="flex-1 rounded-full bg-matcha py-3.25 text-[15px] font-bold text-cream shadow-card transition-transform active:scale-97 disabled:bg-grey-out disabled:shadow-none"
            >
              {out ? "Unavailable" : `Add to order — ₱${(product.price * qty).toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4.5">
      <div className="mb-1.5 text-[12.5px] font-bold text-matcha-deep">{label}</div>
      {children}
    </div>
  );
}

function TagList({ items, allergen }: { items: string[]; allergen?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.75">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-lg border px-2.75 py-1.25 text-[12.5px] ${
            allergen ? "border-[#e4c6c6] bg-[#f5e4e4] text-berry" : "border-line bg-paper text-ink-soft"
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
