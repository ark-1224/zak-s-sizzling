"use client";

import { Icon } from "@/components/Icon";

// Ported from kiosk.html's .stepper (Downloads/kiosk.html, lines 276-285, 662-666).
interface QtyStepperProps {
  qty: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
}

export function QtyStepper({ qty, onChange, disabled }: QtyStepperProps) {
  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-line bg-white">
      <button
        disabled={disabled}
        onClick={() => qty > 1 && onChange(qty - 1)}
        aria-label="Decrease quantity"
        className="flex h-12 w-12 items-center justify-center text-matcha-deep active:bg-paper disabled:opacity-40"
      >
        <Icon name="minus" className="h-5 w-5" />
      </button>
      <span className="w-9 text-center text-lg font-bold" aria-live="polite">
        {qty}
      </span>
      <button
        disabled={disabled}
        onClick={() => onChange(qty + 1)}
        aria-label="Increase quantity"
        className="flex h-12 w-12 items-center justify-center text-matcha-deep active:bg-paper disabled:opacity-40"
      >
        <Icon name="plus" className="h-5 w-5" />
      </button>
    </div>
  );
}
