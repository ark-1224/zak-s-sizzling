"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@zaks/shared-types";
import { categoryBgColor } from "@/lib/categoryColors";
import { Icon } from "@/components/Icon";
import { ProductPhoto } from "./ProductPhoto";

// One dish in the menu grid: its photo slot on top (the photo, or its icon on the
// category colour until a photo is uploaded), then the name and price. Tapping the tile
// opens the item sheet for quantity and special instructions; the round + adds one
// straight to the order. Sold out (product.isAvailable, flipped live by the
// inventory:updated event) dims the tile and removes the +.
interface ItemTileProps {
  product: Product;
  onOpen: () => void;
  onQuickAdd: () => void;
}

const ADDED_FEEDBACK_MS = 900;

export function ItemTile({ product, onOpen, onQuickAdd }: ItemTileProps) {
  const out = !product.isAvailable;
  const [justAdded, setJustAdded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleQuickAdd() {
    onQuickAdd();
    setJustAdded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
  }

  return (
    // The + is a sibling of the tile button, not inside it: a button inside a button is
    // invalid HTML and makes the inner tap ambiguous.
    <li className="relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={out}
        className={`flex h-full w-full flex-col overflow-hidden rounded-[18px] bg-white text-left shadow-card transition-transform active:scale-97 disabled:active:scale-100 ${
          out ? "opacity-60" : ""
        }`}
      >
        {/* 4:3 rather than square: two rows of tiles must fit under the frame on the
            600px-tall kiosk screen. The icon is sized to the slot (container units) and
            sits up and left of centre (top-left on phones), clear of the + in the corner. */}
        <span
          className="@container relative block aspect-[4/3] w-full overflow-hidden"
          style={{ background: categoryBgColor(product.category?.name) }}
        >
          <ProductPhoto
            imageUrl={product.imageUrl}
            icon={product.icon}
            iconClassName="text-[32cqw] leading-none sm:text-[30cqw]"
            iconPlacement="items-start justify-start p-[9%] sm:items-center sm:justify-center sm:p-0 sm:pr-[12%] sm:pb-[6%]"
          />
          {out && (
            <span className="absolute inset-x-0 bottom-0 bg-char/85 py-1.5 text-center text-sm font-bold tracking-wide text-cream">
              SOLD OUT
            </span>
          )}
        </span>
        <span className="flex flex-1 flex-col px-3 pt-2.5 pb-3">
          <span className="line-clamp-2 text-base leading-snug font-semibold text-ink lg:text-[17px]">{product.name}</span>
          <span className="font-display mt-auto pt-1.5 text-xl font-bold text-price-accent">₱{product.price.toFixed(2)}</span>
        </span>
      </button>

      {/* Laid over the photo slot (same 4:3 box), with the + in its lower corner. */}
      {!out && (
        <span className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/3]">
          <button
            type="button"
            onClick={handleQuickAdd}
            aria-label={`Add one ${product.name} to your order`}
            className={`pointer-events-auto absolute right-2 bottom-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white text-cream shadow-card transition-transform active:scale-90 ${
              justAdded ? "bg-available" : "bg-matcha"
            }`}
          >
            <Icon name={justAdded ? "check" : "plus"} className="h-6 w-6" />
          </button>
        </span>
      )}
    </li>
  );
}
