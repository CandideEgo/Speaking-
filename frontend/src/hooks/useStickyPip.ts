"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

interface StickyPipResult {
  /**
   * True when the slot has scrolled out of the top portion of the viewport and
   * the user has not dismissed the mini-player. Use this to toggle the
   * media wrapper between its in-flow and fixed (mini-player) styles.
   */
  isPip: boolean;
  /** Hide the mini-player until the slot scrolls back into view (re-arms it). */
  dismiss: () => void;
}

/**
 * Mobile sticky mini-player (PiP-style) trigger.
 *
 * Observes ``slotRef`` with an IntersectionObserver; when the slot scrolls out
 * of the top 20% of the viewport, ``isPip`` becomes true so the caller can pin
 * the media element as a fixed mini-player. The media element itself is never
 * re-parented — the caller only toggles CSS classes on a wrapper — so playback
 * state is preserved across the switch.
 *
 * Pass ``enabled=false`` to disable (e.g. on desktop, where the slot is already
 * sticky via CSS). The observer is only attached while enabled.
 */
export function useStickyPip<T extends HTMLElement>(
  slotRef: RefObject<T | null>,
  enabled: boolean,
): StickyPipResult {
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPinned(false);
      return;
    }
    const el = slotRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setPinned(!entry.isIntersecting);
        // Re-arm dismissal whenever the slot re-enters the viewport.
        if (entry.isIntersecting) setDismissed(false);
      },
      // Trigger when the slot leaves the top 20% of the viewport.
      { threshold: 0, rootMargin: "0px 0px -80% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, slotRef]);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { isPip: pinned && !dismissed, dismiss };
}
