"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@zaks/shared-types";
import { categoryBgColor } from "@/lib/categoryColors";
import { useCart } from "@/hooks/useCart";
import { Icon } from "@/components/Icon";
import { useToast } from "./Toast";
import { QtyStepper } from "./QtyStepper";
import { NutritionGrid } from "./NutritionGrid";

// Item sheet: a bottom sheet on phones, a centred sheet from md up. The quantity stepper
// and "Add to order" button sit in a footer outside the scrolling area, so they're always
// on screen — on the 600px-tall kiosk they used to be scrolled out of view below the
// nutrition facts.
//
// Customizing = quick instruction chips plus an optional typed note. Both are combined
// into the same single specialInstructions string the order has always sent, so nothing
// changes for the cart, the API or the kitchen display.
const INSTRUCTIONS_MAX = 140; // matches the API/database limit for special instructions
const FOOD_CHIPS = ["Extra spicy", "Not spicy", "No onions", "Well done", "Sauce on the side"];
const DRINK_CHIPS = ["Less ice", "No ice", "Less sugar"];
const SEPARATOR = ", ";

interface ProductModalProps {
  product: Product;
  onClose: () => void;
}

export function ProductModal({ product, onClose }: ProductModalProps) {
  const [qty, setQty] = useState(1);
  const [chips, setChips] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [keyboardRoom, setKeyboardRoom] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const out = !product.isAvailable;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const chipOptions = product.category?.name === "Drinks" ? DRINK_CHIPS : FOOD_CHIPS;
  // Keep chips in their on-screen order regardless of the order they were tapped.
  const chipText = chipOptions.filter((c) => chips.includes(c)).join(SEPARATOR);
  const instructions = [chipText, note.trim()].filter(Boolean).join(SEPARATOR);
  const noteMax = INSTRUCTIONS_MAX - chipText.length - (chipText ? SEPARATOR.length : 0);

  // A chip that would push the combined text past the limit is disabled rather than
  // silently cutting the customer's note short.
  function chipFits(chip: string) {
    return instructions.length + (instructions ? SEPARATOR.length : 0) + chip.length <= INSTRUCTIONS_MAX;
  }

  function toggleChip(chip: string) {
    setChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  }

  // The kiosk's on-screen keyboard covers the bottom ~40% of the 600px screen, and on
  // Linux it usually does so without resizing the page — so the browser never moves the
  // note box out of its way (measured: the box sat at 301-375px, under a keyboard
  // starting at 320-360px). On focus, add room below the content and scroll the box up
  // near the top of the sheet. The room stays until the sheet closes, so the footer
  // never jumps under the customer's finger when the note loses focus.
  function handleNoteFocus() {
    setKeyboardRoom(true);
    requestAnimationFrame(() => noteRef.current?.scrollIntoView({ block: "start" }));
  }

  function handleAddToCart() {
    addToCart(product, qty, instructions);
    onClose();
    showToast(`Added ${qty} × ${product.name} to your order`);
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-[#22301f]/55 pt-8 motion-reduce:animate-none md:items-center md:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* max-h-full: capped at the backdrop's height, which (being fixed inset-0) tracks
          the visible screen, minus the pt-8 / md:p-6 gap. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        className="animate-sheet-up relative flex max-h-full w-full flex-col overflow-hidden rounded-t-3xl bg-cream shadow-2xl motion-reduce:animate-none md:max-w-2xl md:rounded-3xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-ink shadow-card"
        >
          <Icon name="close" className="h-6 w-6" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Photo slot: same box an <img className="h-full w-full object-cover" /> will fill. */}
          <div
            className="flex h-36 items-center justify-center text-6xl md:h-40 md:text-7xl"
            style={{ background: categoryBgColor(product.category?.name) }}
          >
            <span aria-hidden="true">{product.icon}</span>
          </div>

          <div className="px-5 pt-4 pb-5 md:px-7">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display min-w-0 text-2xl font-semibold break-words text-matcha-deep">{product.name}</h2>
              <span className="text-xl font-bold whitespace-nowrap text-price-accent">₱{product.price.toFixed(2)}</span>
            </div>

            <span
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${
                out ? "bg-grey-out/18 text-ink-soft" : "bg-available/14 text-available"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {out ? "Currently unavailable" : "In stock"}
            </span>

            {product.description && <p className="mt-3 text-base leading-relaxed text-ink-soft">{product.description}</p>}

            {/* Allergens stay visible (not folded away with the rest of the details) since
                they're safety information. */}
            {product.allergens.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-matcha-deep">Allergens</h3>
                <TagList items={product.allergens} allergen />
              </div>
            )}

            {!out && (
              <div className="mt-5">
                <h3 className="text-base font-bold text-matcha-deep">Special instructions</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {chipOptions.map((chip) => {
                    const selected = chips.includes(chip);
                    return (
                      <button
                        key={chip}
                        onClick={() => toggleChip(chip)}
                        disabled={!selected && !chipFits(chip)}
                        aria-pressed={selected}
                        className={`flex min-h-12 items-center gap-1.5 rounded-full border px-4 text-base font-medium transition-colors disabled:opacity-40 ${
                          selected ? "border-matcha bg-matcha/10 text-matcha-deep" : "border-line bg-white text-ink"
                        }`}
                      >
                        {selected && <Icon name="check" className="h-4 w-4" />}
                        {chip}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block">
                  <span className="sr-only">Anything else for the kitchen?</span>
                  <textarea
                    ref={noteRef}
                    placeholder="Anything else for the kitchen? (optional)"
                    maxLength={noteMax}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onFocus={handleNoteFocus}
                    className="w-full scroll-mt-16 resize-none rounded-xl border border-line bg-white px-3.5 py-3 text-base text-ink outline-none focus:border-matcha"
                  />
                </label>
                <p className="mt-1 text-sm text-ink-soft">
                  Sent to the kitchen display with your order · {instructions.length}/{INSTRUCTIONS_MAX}
                </p>
              </div>
            )}

            <details className="group mt-5 rounded-xl border border-line bg-white">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-base font-semibold text-matcha-deep">
                Ingredients & nutrition
                <Icon name="chevronDown" className="h-5 w-5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-4 pt-3 pb-4">
                {product.ingredients.length > 0 && <TagList items={product.ingredients} />}
                <div className="mt-3">
                  <NutritionGrid nutrition={product.nutrition} />
                </div>
              </div>
            </details>
          </div>
          {/* Scroll room for the on-screen keyboard (see handleNoteFocus). */}
          {keyboardRoom && <div aria-hidden="true" className="h-[45dvh]" />}
        </div>

        <div
          className="flex shrink-0 items-center gap-3 border-t border-line bg-cream px-5 pt-3 md:px-7"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <QtyStepper qty={qty} onChange={setQty} disabled={out} />
          <button
            disabled={out}
            onClick={handleAddToCart}
            className="min-h-14 min-w-0 flex-1 rounded-full bg-matcha px-4 text-base font-bold text-cream shadow-card transition-transform active:scale-97 disabled:bg-grey-out disabled:shadow-none sm:text-lg"
          >
            {out ? (
              "Unavailable"
            ) : (
              <>
                <span className="sm:hidden">Add · </span>
                <span className="hidden sm:inline">Add to order · </span>₱{(product.price * qty).toFixed(2)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function TagList({ items, allergen }: { items: string[]; allergen?: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            allergen ? "border-[#e4c6c6] bg-[#f5e4e4] text-berry" : "border-line bg-paper text-ink-soft"
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
