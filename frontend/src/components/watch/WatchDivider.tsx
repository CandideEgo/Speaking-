"use client";

import { useRef } from "react";
import { DEFAULT_WATCH_RATIO, type watchSplit } from "@/lib/watchLayout";

export function WatchDivider({
  split,
  onChange,
}: {
  split: NonNullable<ReturnType<typeof watchSplit>>;
  onChange: (ratio: number) => void;
}) {
  const drag = useRef({ x: 0, ratio: 0 });
  const change = (ratio: number) => onChange(Math.min(split.max, Math.max(split.min, ratio)));
  return (
    <div
      role="separator"
      aria-label="调整视频与文稿比例"
      aria-orientation="vertical"
      aria-controls="watch-video-column watch-transcript"
      aria-valuemin={Math.round(split.min)}
      aria-valuemax={Math.round(split.max)}
      aria-valuenow={Math.round(split.ratio)}
      aria-valuetext={`视频 ${Math.round(split.ratio)}%，文稿 ${Math.round(100 - split.ratio)}%`}
      tabIndex={0}
      data-testid="watch-divider"
      className="watch-divider"
      title="拖动或按左右方向键调整，双击恢复默认"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, ratio: split.ratio };
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        change(drag.current.ratio + ((event.clientX - drag.current.x) / split.available) * 100);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onDoubleClick={() => change(DEFAULT_WATCH_RATIO)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 5 : 2;
        const ratio = {
          ArrowLeft: split.ratio - step,
          ArrowRight: split.ratio + step,
          Home: split.min,
          End: split.max,
          Enter: DEFAULT_WATCH_RATIO,
        }[event.key];
        if (ratio === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        change(ratio);
      }}
    >
      <span aria-hidden="true" />
    </div>
  );
}
