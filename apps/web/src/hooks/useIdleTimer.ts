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
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }

  function scheduleWarning() {
    clearTimers();
    warningTimer.current = setTimeout(() => {
      setShowWarning(true);
      resetTimer.current = setTimeout(() => {
        setShowWarning(false);
        onReset();
      }, resetAfterMs);
    }, warningAfterMs);
  }

  function stayActive() {
    setShowWarning(false);
    scheduleWarning();
  }

  useEffect(() => {
    scheduleWarning();
    const handleActivity = () => {
      // Only idle activity resets the timer silently; once the warning is showing,
      // activity must go through stayActive() (the explicit "I'm still here" tap)
      // so a stray brush against the screen doesn't silently dismiss the prompt.
      if (!showWarning) scheduleWarning();
    };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWarning]);

  return { showWarning, stayActive };
}
