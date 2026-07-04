"use client";

import { useRef, useCallback } from "react";

const MIN_PANEL_WIDTH = 25;
const MAX_PANEL_WIDTH = 75;

interface UsePanelResizeOptions {
  leftPanelWidth: number;
  setLeftPanelWidth: (width: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
}

interface UsePanelResizeReturn {
  startResize: (e: React.MouseEvent) => void;
}

/**
 * Hook for handling panel resize via mouse drag.
 * Returns a startResize handler to attach to a resize handle element.
 */
export function usePanelResize({
  leftPanelWidth,
  setLeftPanelWidth,
  onResizeStart,
  onResizeEnd,
}: UsePanelResizeOptions): UsePanelResizeReturn {
  const resizeRef = useRef({ startX: 0, startWidth: 0 });

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onResizeStart?.();
      document.body.classList.add("resizing-panels");
      resizeRef.current = { startX: e.clientX, startWidth: leftPanelWidth };

      const onMouseMove = (e: MouseEvent) => {
        const { startX, startWidth } = resizeRef.current;
        const deltaX = e.clientX - startX;
        const deltaPercent = (deltaX / window.innerWidth) * 100;
        const newWidth = Math.max(
          MIN_PANEL_WIDTH,
          Math.min(MAX_PANEL_WIDTH, startWidth + deltaPercent),
        );
        setLeftPanelWidth(newWidth);
      };

      const onMouseUp = () => {
        onResizeEnd?.();
        document.body.classList.remove("resizing-panels");
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [leftPanelWidth, setLeftPanelWidth, onResizeStart, onResizeEnd],
  );

  return { startResize };
}
