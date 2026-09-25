"use client";

// Ported from kiosk.html's .stepper (Downloads/kiosk.html, lines 276-285, 662-666).
interface QtyStepperProps {
  qty: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
}

export function QtyStepper({ qty, onChange, disabled }: QtyStepperProps) {
  return (
    <div className="flex items-center overflow-hidden rounded-full border border-line bg-white">
      <button
        disabled={disabled}
        onClick={() => qty > 1 && onChange(qty - 1)}
        aria-label="Decrease quantity"
        className="h-11 w-11 text-lg font-bold text-matcha-deep active:bg-paper disabled:opacity-40"
      >
        −
      </button>
      <span className="w-8.5 text-center text-base font-bold" aria-live="polite">
        {qty}
      </span>
      <button
        disabled={disabled}
        onClick={() => onChange(qty + 1)}
        aria-label="Increase quantity"
        className="h-11 w-11 text-lg font-bold text-matcha-deep active:bg-paper disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
