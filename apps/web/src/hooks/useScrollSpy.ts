"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Scroll-spy for the menu: reports which section is currently at the top of a scroll
// container, and scrolls to a section on request (used by the category rail).
//
// Sections are found by their `data-spy-id` attribute inside the container rather than
// one ref per section, so the list can re-render (search, live stock updates) freely.
// The container must be `position: relative` so each section's offsetTop is measured
// from the top of the container.
const TOLERANCE_PX = 4;
const TAP_SCROLL_LOCK_MS = 700;

export function useScrollSpy(sectionIds: string[]) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // While a rail tap is smooth-scrolling, the sections in between briefly pass the top;
  // skipping measurement during that time stops the rail highlight flickering through them.
  const lockedRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The section last chosen from the rail. Near the end of the list a section can't be
  // scrolled all the way to the top, so at the bottom it stays highlighted (if visible)
  // instead of jumping to the last section.
  const lastTappedRef = useRef<string | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || lockedRef.current) return;
    const sections = container.querySelectorAll<HTMLElement>("[data-spy-id]");
    if (sections.length === 0) {
      setActiveId(null);
      return;
    }

    // The last sections are often too short to ever reach the top; once the list is
    // scrolled to the bottom, the last one counts as current — unless the customer just
    // tapped a section that's on screen.
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
    let current = sections[0].dataset.spyId ?? null;
    if (atBottom) {
      const tapped = [...sections].find((s) => s.dataset.spyId === lastTappedRef.current);
      const tappedVisible =
        tapped && tapped.offsetTop < container.scrollTop + container.clientHeight && tapped.offsetTop >= container.scrollTop;
      current = tappedVisible ? lastTappedRef.current : (sections[sections.length - 1].dataset.spyId ?? null);
    } else {
      for (const section of sections) {
        if (section.offsetTop - TOLERANCE_PX > container.scrollTop) break;
        current = section.dataset.spyId ?? null;
      }
    }
    setActiveId(current);
  }, []);

  const idsKey = sectionIds.join("|");

  // Re-attaches when the section list changes — including the first time the list
  // mounts after the menu finishes loading, when containerRef goes from null to set.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = requestAnimationFrame(measure);
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [measure, idsKey]);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    };
  }, []);

  const scrollToId = useCallback((id: string) => {
    const container = containerRef.current;
    const section = container?.querySelector<HTMLElement>(`[data-spy-id="${id}"]`);
    if (!container || !section) return;

    lockedRef.current = true;
    lastTappedRef.current = id;
    setActiveId(id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ top: section.offsetTop, behavior: reduceMotion ? "auto" : "smooth" });

    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      lockedRef.current = false;
    }, TAP_SCROLL_LOCK_MS);
  }, []);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0 });
  }, []);

  return { containerRef, activeId, scrollToId, scrollToTop };
}
