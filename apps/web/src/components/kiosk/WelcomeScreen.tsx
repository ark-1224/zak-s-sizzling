"use client";

import { Icon } from "@/components/Icon";
import { SizzlingPlate } from "./SizzlingPlate";

// The kiosk's attract screen: what the kiosk shows between customers, and where the idle
// reset returns to. The whole screen is one big button, so a tap anywhere starts an
// order. The picture is always the drawn sizzling plate with rising steam: it stays sharp
// at any size and keeps moving, which draws people over (dish photos are on the menu).
interface WelcomeScreenProps {
  onStart: () => void;
  /** Online payment (QR Ph) is set up; null while still checking. */
  onlinePayments: boolean | null;
}

export function WelcomeScreen({ onStart, onlinePayments }: WelcomeScreenProps) {
  return (
    <button
      type="button"
      onClick={onStart}
      aria-label="Start your order"
      className="animate-fade-in fixed inset-0 z-60 flex flex-col overflow-hidden bg-char text-left text-cream motion-reduce:animate-none"
    >
      <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col items-center gap-4 px-6 pt-8 sm:px-10 lg:flex-row lg:gap-10 lg:pt-0">
        <div className="flex w-full flex-col items-center text-center lg:w-[46%] lg:items-start lg:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="Zak's Sizzling Hub"
            className="h-20 w-20 rounded-[50%_50%_50%_12px] object-cover ring-4 ring-honey/40 sm:h-24 sm:w-24"
          />
          <h1 className="font-display mt-5 text-5xl leading-[0.95] font-extrabold tracking-[-0.02em] sm:text-6xl lg:mt-7 lg:text-7xl">
            Sizzling hot.
            <span className="block text-honey">Order here.</span>
          </h1>
          <p className="mt-4 max-w-sm text-lg text-cream/80">
            Pick your plates, pay your way, and watch the screen at the counter for your order number.
          </p>
        </div>

        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center lg:h-full lg:w-[54%]">
          <SizzlingPlate steam className="h-auto max-h-full w-full max-w-sm lg:max-w-none" />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-4 border-t border-honey/25 px-6 py-5 sm:flex-row sm:justify-between sm:px-10">
        <span className="flex items-center gap-3 font-display text-2xl font-bold text-honey motion-safe:animate-pulse">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-honey text-char">
            <Icon name="chevronRight" className="h-6 w-6" />
          </span>
          Tap anywhere to start
        </span>
        <span className="flex items-center gap-5 text-base text-cream/80">
          <span className="flex items-center gap-2">
            <Icon name="cash" className="h-5 w-5 text-honey" />
            Pay at the counter
          </span>
          {onlinePayments && (
            <span className="flex items-center gap-2">
              <Icon name="qr" className="h-5 w-5 text-honey" />
              QR Ph
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
