"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TARGET_LEVEL_OPTIONS, levelMeta, levelDotClass } from "@/lib/examLevels";

/** 下拉面板宽度（px）—— 固定定位时用它把面板夹在视口内。 */
const PANEL_WIDTH = 132;

/**
 * 考试目标层级选择器：默认是**播放器右上角收起药丸**（`variant="pill"`，自己绝对定位），
 * `variant="inline"` 时去掉绝对定位、由父层（观看页壳顶栏）决定落点 —— DEC-069 / #31
 * 把移动端的它从画面里搬进 44px 顶栏；桌面端仍走默认的 `pill`，零改动。
 *
 * 面板用 **fixed** 定位（坐标由触发按钮量出来）：顶栏在 `main#main-scroll` 之上、
 * 滚动容器 `overflow-y-auto` 会裁掉任何下探的绝对定位面板 —— 顶栏没有 `transform` /
 * `filter`，是 fixed 的包含块，所以这样量出来的坐标不会随滚动漂。
 */
export function ExamLevelSelector({
  level,
  onChange,
  variant = "pill",
}: {
  level: string | null;
  onChange: (level: string) => void;
  variant?: "pill" | "inline";
}) {
  const inline = variant === "inline";
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const current = levelMeta(level ?? "cet4") ?? TARGET_LEVEL_OPTIONS[0];

  function toggle() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    setOpen((o) => !o);
  }

  return (
    <div className={inline ? "relative shrink-0" : "absolute top-3 right-3 z-20"}>
      <button
        ref={btnRef}
        onClick={toggle}
        data-testid="level-selector"
        aria-expanded={open ? true : false}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/55 backdrop-blur text-white text-xs font-medium hover:bg-black/70 transition-colors cursor-pointer"
      >
        <span className={cn("w-2 h-2 rounded-full", levelDotClass(current.color))} />
        {current.label}
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            data-testid="level-selector-panel"
            className="fixed z-50 bg-canvas border border-hairline rounded-lg shadow-lift p-1 min-w-[120px]"
            style={{ top: pos?.top ?? 48, right: pos?.right ?? 8, width: PANEL_WIDTH }}
          >
            {TARGET_LEVEL_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  onChange(opt.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left cursor-pointer transition-colors",
                  opt.key === current.key
                    ? "bg-brand-50 text-brand-600 font-semibold"
                    : "text-ink hover:bg-surface-soft"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full", levelDotClass(opt.color))} />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
