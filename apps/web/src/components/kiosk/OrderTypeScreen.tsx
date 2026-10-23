"use client";

import type { OrderType } from "@zaks/shared-types";
import { Icon } from "@/components/Icon";
import { DineInArt, TakeOutArt } from "./OrderTypeArt";

// Asked once, right after the welcome screen (like an in-store burger kiosk): the answer
// rides with the order to the receipt and the kitchen display. It isn't asked again;
// "Start over" clears it along with the order.
const CHOICES: { value: OrderType; label: string; hint: string; Art: typeof DineInArt }[] = [
  { value: "dine_in", label: "Dine in", hint: "Eat here at Zak's", Art: DineInArt },
  { value: "take_out", label: "Take out", hint: "Packed to go", Art: TakeOutArt },
];

interface OrderTypeScreenProps {
  onChoose: (orderType: OrderType) => void;
  onStartOver: () => void;
}

export function OrderTypeScreen({ onChoose, onStartOver }: OrderTypeScreenProps) {
  return (
    <div className="animate-fade-in fixed inset-0 z-60 flex flex-col bg-paper motion-reduce:animate-none">
      <header className="flex shrink-0 items-center gap-3 border-b-2 border-honey/50 bg-char px-4 py-3 text-cream sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" className="h-10 w-10 rounded-[50%_50%_50%_8px] object-cover" />
        <span className="font-display hidden text-xl font-bold sm:inline">Zak&apos;s Sizzling Hub</span>
        <button
          type="button"
          onClick={onStartOver}
          className="ml-auto flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-semibold whitespace-nowrap text-cream/85 active:bg-white/10"
        >
          <Icon name="restart" className="h-5 w-5" />
          Start over
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-5 py-6 sm:gap-8">
        <h1 className="font-display text-center text-4xl font-extrabold tracking-[-0.02em] text-matcha-deep sm:text-5xl">
          Where will you eat today?
        </h1>
        <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          {CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              onClick={() => onChoose(choice.value)}
              className="group flex min-h-40 flex-row items-center gap-4 overflow-hidden rounded-[22px] border-2 border-line bg-cream px-4 py-4 text-left shadow-card transition-transform active:scale-97 sm:min-h-64 sm:flex-col sm:justify-center sm:gap-2 sm:px-6 sm:text-center"
            >
              <choice.Art className="h-28 w-auto shrink-0 sm:h-40" />
              <span>
                <span className="font-display block text-3xl font-extrabold text-ink">{choice.label}</span>
                <span className="mt-1 block text-lg text-ink-soft">{choice.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
