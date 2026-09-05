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
      <div
        className={`fixed bottom-7 left-1/2 z-60 -translate-x-1/2 rounded-full bg-matcha-deep px-6 py-3.5 text-sm font-semibold text-cream shadow-2xl transition-all duration-250 ${
          message ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-5 opacity-0"
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
