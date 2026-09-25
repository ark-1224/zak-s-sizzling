"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

// Ported from kiosk.html's #toast / showToast() (Downloads/kiosk.html, lines 349-357,
// 417, 811-819) as a React context, driven by state instead of classList + setTimeout.
interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* inset-x-4 + mx-auto + w-fit: centered, shrink-wrapped to the message, but never
          wider than the screen minus 16px gutters. (left-1/2 alone left the toast only
          half the screen to lay text out in, so longer messages became a tall sliver.)
          bottom-24 keeps it above the floating "View order" bar. It's information only, so
          it never takes taps, and z-35 keeps it behind the basket (z-40) and item sheet
          (z-50) instead of covering their totals and buttons. */}
      <div
        role="status"
        className={`pointer-events-none fixed inset-x-4 bottom-24 z-35 mx-auto w-fit max-w-md rounded-3xl bg-ink px-5 py-3 text-center text-base font-semibold text-cream shadow-2xl transition-all duration-250 sm:px-6 sm:py-3.5 ${
          message ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
        }`}
      >
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
