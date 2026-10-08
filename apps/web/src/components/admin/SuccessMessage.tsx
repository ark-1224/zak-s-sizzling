"use client";

import { useCallback, useEffect, useState } from "react";

// A short confirmation after a save ("Sizzling Sisig saved"), so the admin knows it
// worked even though the form just closes (UI review #13). It fades on its own after
// a few seconds and can be dismissed sooner.

const SHOW_FOR_MS = 5000;

export function useSuccessMessage() {
  // The id restarts the timer when the same message is shown twice in a row.
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), SHOW_FOR_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const show = useCallback((text: string) => setMessage({ text, id: Date.now() }), []);
  const clear = useCallback(() => setMessage(null), []);
  return { text: message?.text ?? null, show, clear };
}

/** The live region stays mounted so screen readers announce each new message. */
export function SuccessMessage({ text, onDismiss }: { text: string | null; onDismiss: () => void }) {
  return (
    <div role="status" aria-live="polite">
      {text && (
        <div className="flex items-start gap-3 rounded-[6px] border border-adm-ok bg-adm-ok-soft px-4 py-3 text-base text-adm-ink md:items-center md:py-2.5 md:text-sm">
          <span aria-hidden="true" className="font-bold text-adm-ok">
            ✓
          </span>
          <span className="min-w-0 flex-1 break-words">{text}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss message"
            className="-my-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] text-adm-ink-3 md:h-7 md:w-7"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
