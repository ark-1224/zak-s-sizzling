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
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-[#22301f]/70 p-5">
      <div className="w-full max-w-sm rounded-card bg-cream p-8 text-center shadow-2xl">
        <div className="mb-3 text-4xl">⏳</div>
        <h2 className="font-display mb-1.5 text-xl font-semibold text-matcha-deep">Still there?</h2>
        <p className="mb-6 text-sm text-ink-soft">
          This kiosk will reset shortly to keep things moving for the next customer.
        </p>
        <button
          onClick={onStayActive}
          className="w-full rounded-full bg-matcha py-3 font-bold text-cream shadow-card"
        >
          I&apos;m still here
        </button>
      </div>
    </div>
  );
}
