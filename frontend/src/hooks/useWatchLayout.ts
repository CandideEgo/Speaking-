"use client";

import { useEffect, useState, type RefObject } from "react";
import { watchSplit } from "@/lib/watchLayout";

/** Measure the workspace, never the sentence or notes, to keep the picture stable. */
export function useWatchLayout(
  workspaceRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  isMobile: boolean,
  preferredRatio: number
) {
  const [bounds, setBounds] = useState({ width: 0, asideHeight: 0 });
  useEffect(() => {
    const workspace = workspaceRef.current;
    const main = workspace?.closest("main");
    if (!enabled || !workspace || !main) return;
    let raf = 0;
    const measure = () => {
      const box = workspace.getBoundingClientRect();
      const mainBox = main.getBoundingClientRect();
      const next = {
        width: box.width,
        asideHeight: Math.max(200, mainBox.bottom - Math.max(mainBox.top + 16, box.top) - 16),
      };
      setBounds((previous) =>
        Math.abs(previous.width - next.width) < 0.5 &&
        Math.abs(previous.asideHeight - next.asideHeight) < 0.5
          ? previous
          : next
      );
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(workspace);
    observer.observe(main);
    main.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      observer.disconnect();
      main.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [workspaceRef, enabled, isMobile]);
  return {
    split: !isMobile ? watchSplit(bounds.width, preferredRatio) : null,
    asideHeight: bounds.asideHeight || undefined,
  };
}
