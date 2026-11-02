"use client";

import { useRef, useState, type Ref } from "react";

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
  handleRef,
  dragEnabled = true,
}: {
  onDrag: (dy: number) => void;
  onRelease: (dy: number) => void;
  label?: string;
  testId?: string;
  /** 弹层要把首焦点放在把手上（Base UI 的 `initialFocus`）时传进来。 */
  handleRef?: Ref<HTMLDivElement>;
  /**
   * 关掉后只保留键盘关闭（Enter/Space）与视觉把手，指针拖动交给外层原语
   * —— `WatchMoreSheet` 换成 Base UI Drawer 后整张卡片都由原语接管下拉，
   * 这里再拖一次会与它抢同一个手势。
   */
  dragEnabled?: boolean;
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
      ref={handleRef}
      data-testid={testId}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRelease(SHEET_CLOSE_DRAG_PX + 1);
        }
      }}
      onPointerDown={dragEnabled ? down : undefined}
      onPointerMove={dragEnabled ? move : undefined}
      onPointerUp={dragEnabled ? up : undefined}
      onPointerCancel={dragEnabled ? up : undefined}
      className={
        "flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 active:cursor-grabbing " +
        (dragging ? "" : "transition-transform duration-150")
      }
    >
      <span className="h-1 w-9 rounded-full bg-surface-cream-strong" />
    </div>
  );
}
