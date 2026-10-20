"use client";

interface IdleTimeoutOverlayProps {
  show: boolean;
  onStayActive: () => void;
}

// New in Sprint 2 — kiosk.html had no idle-timeout UI to port from; this satisfies the
// manuscript's "Kiosk Session and Idle Timeout" requirement.
export function IdleTimeoutOverlay({ show, onStayActive }: IdleTimeoutOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-char/75 p-3 sm:p-5">
      <div role="alertdialog" aria-modal="true" aria-label="Still there?" className="w-full max-w-sm rounded-card bg-cream p-6 text-center shadow-2xl sm:p-8">
        <h2 className="font-display mb-1.5 text-3xl font-extrabold text-matcha-deep">Still there?</h2>
        <p className="mb-6 text-base text-ink-soft">
          This kiosk will reset shortly to keep things moving for the next customer.
        </p>
        <button
          onClick={onStayActive}
          className="min-h-14 w-full rounded-full bg-matcha text-lg font-bold text-cream shadow-card"
        >
          I&apos;m still here
        </button>
      </div>
    </div>
  );
}
