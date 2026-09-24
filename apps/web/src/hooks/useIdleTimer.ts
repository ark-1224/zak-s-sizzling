"use client";

import { useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "touchstart", "keydown", "wheel"] as const;

interface UseIdleTimerOptions {
  /** Inactivity before showing the "Still there?" prompt. */
  warningAfterMs?: number;
  /** Additional inactivity after the prompt appears before auto-resetting the session. */
  resetAfterMs?: number;
  onReset: () => void;
}

/**
 * Kiosk idle-timeout / session-management, per the manuscript's "Kiosk Session and Idle
 * Timeout" requirement: if the kiosk sits inactive, the session resets — clearing the
 * cart and returning to the default screen — to prevent abandoned carts.
 */
export function useIdleTimer({ warningAfterMs = 60_000, resetAfterMs = 20_000, onReset }: UseIdleTimerOptions) {
  const [showWarning, setShowWarning] = useState(false);
  // Mirrors showWarning for the activity handler to read synchronously — the handler
  // is registered once (empty-deps effect below) so it can't close over fresh state,
  // and re-registering it on every showWarning change was the actual bug: the main
  // effect re-running cleared the just-armed reset timer and started a whole new
  // warningAfterMs cycle instead, roughly doubling the real time-to-reset.
  const showWarningRef = useRef(false);
  const onResetRef = useRef(onReset);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  function clearTimers() {
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }

  function scheduleWarning() {
    clearTimers();
    warningTimer.current = setTimeout(() => {
      showWarningRef.current = true;
      setShowWarning(true);
      resetTimer.current = setTimeout(() => {
        showWarningRef.current = false;
        setShowWarning(false);
        onResetRef.current();
      }, resetAfterMs);
    }, warningAfterMs);
  }

  function stayActive() {
    showWarningRef.current = false;
    setShowWarning(false);
    scheduleWarning();
  }

  useEffect(() => {
    scheduleWarning();
    const handleActivity = () => {
      // Only idle activity resets the timer silently; once the warning is showing,
      // activity must go through stayActive() (the explicit "I'm still here" tap)
      // so a stray brush against the screen doesn't silently dismiss the prompt.
      if (!showWarningRef.current) scheduleWarning();
    };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearTimers();
    };
    // Deliberately empty — this must run exactly once. warningAfterMs/resetAfterMs are
    // treated as fixed for the component's lifetime; onReset is read via onResetRef so
    // it can't go stale without needing to re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { showWarning, stayActive };
}
