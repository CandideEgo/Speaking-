"use client";

import { useEffect, useRef } from "react";

/**
 * setInterval replacement that pauses while the tab is hidden.
 *
 * Background-tab polling wastes bandwidth and battery (and hits backend rate
 * limits for nothing). This hook:
 * - runs `callback` every `intervalMs` while the document is visible;
 * - stops the timer entirely when the tab becomes hidden;
 * - fires an immediate catch-up call and restarts when the tab returns.
 *
 * The initial fetch is still the caller's responsibility (call `callback()`
 * once in the same effect, or rely on the visibility "visible" catch-up).
 */
export function useVisibilityAwareInterval(
  callback: () => void,
  intervalMs: number,
  enabled = true
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => cbRef.current(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        // Catch up on what we missed while hidden, then resume.
        cbRef.current();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
