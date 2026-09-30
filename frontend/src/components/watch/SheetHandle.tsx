"use client";

import { useRef, useState } from "react";

/** #26 决议：把手下拉超过这个距离就关闭（实测可关；也是手势集 #29 要认的那一条）。 */
export const SHEET_CLOSE_DRAG_PX = 64;

/**
 * SheetHandle — 移动端浮层顶部的把手下拉关闭手势。
 *
 * 只在把手上响应指针（不动内容区的滚动），下拉期间把实时位移交给父层做 transform，
 * 松手时位移超过 `SHEET_CLOSE_DRAG_PX` 就关。位移一律夹成 >= 0（只往下拖）。
 */
export function SheetHandle({
  onDrag,
  onRelease,
  label = "下拉关闭",
  testId,
}: {
  onDrag: (dy: number) => void;
  onRelease: (dy: number) => void;
  label?: string;
  testId?: string;
}) {
  const startYRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  function down(e: React.PointerEvent) {
    startYRef.current = e.clientY;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    if (startYRef.current === null) return;
    onDrag(Math.max(0, e.clientY - startYRef.current));
  }

  function up(e: React.PointerEvent) {
    if (startYRef.current === null) return;
    const dy = Math.max(0, e.clientY - startYRef.current);
    startYRef.current = null;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointerId may already be released
    }
    onRelease(dy);
  }

  return (
    <div
      data-testid={testId}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={
        "flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 active:cursor-grabbing " +
        (dragging ? "" : "transition-transform duration-150")
      }
    >
      <span className="h-1 w-9 rounded-full bg-cream-strong" />
    </div>
  );
}
