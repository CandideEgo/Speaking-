"use client";

import { useEffect, useState, type RefObject } from "react";

/** 给桌面播放器留出实际句卡高度，包括换行、词条与观看操作。 */
export function useWatchStageWidth(
  stageRef: RefObject<HTMLElement | null>,
  frameRef: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  const [width, setWidth] = useState<number>();
  useEffect(() => {
    const stage = stageRef.current;
    const frame = frameRef.current;
    if (!enabled || !stage || !frame) return;
    const main = stage.closest("main");
    let raf = 0;
    const measure = () => {
      const bounds = stage.getBoundingClientRect();
      const top = bounds.top + (main?.scrollTop ?? 0);
      const chrome = bounds.height - frame.getBoundingClientRect().height;
      const next = (Math.max(160, window.innerHeight - top - chrome - 2) * 16) / 9;
      setWidth((previous) =>
        previous !== undefined && Math.abs(previous - next) < 1 ? previous : next
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
    observer.observe(stage);
    observer.observe(frame);
    if (main) observer.observe(main);
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [enabled, stageRef, frameRef]);
  return enabled ? width : undefined;
}
