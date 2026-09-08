"use client";

import { useEffect, useRef } from "react";

const MAX_INTERVAL_MS = 50; // scanner keystrokes arrive far faster than a human typing
const MIN_LENGTH = 3;

/**
 * USB/Bluetooth barcode scanners act as an HID keyboard — no driver needed. This
 * listens globally for a burst of keystrokes faster than a human can type, terminated
 * by Enter, and treats that as a scan. A plain manual-entry field (in ProductForm)
 * remains the required fallback per the manuscript's barcode scanning requirement —
 * this hook is additive, not a replacement for typing.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    function handleKeydown(e: KeyboardEvent) {
      // Ignore keystrokes typed into a normal input/textarea — those already have
      // their own manual-entry handling and shouldn't be hijacked as scan input.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (elapsed > MAX_INTERVAL_MS) bufferRef.current = ""; // gap too long — not a scan, reset

      if (e.key === "Enter") {
        if (bufferRef.current.length >= MIN_LENGTH) onScan(bufferRef.current);
        bufferRef.current = "";
        return;
      }
      if (e.key.length === 1) bufferRef.current += e.key;
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onScan, enabled]);
}
