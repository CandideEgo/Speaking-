"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TARGET_LEVEL_OPTIONS,
  levelMeta,
  levelDotClass,
} from "@/lib/examLevels";

/** 考试目标层级选择器：播放器右上角收起药丸，点开下拉，不干扰观看。 */
export function ExamLevelSelector({
  level,
  onChange,
}: {
  level: string | null;
  onChange: (level: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = levelMeta(level ?? "cet4") ?? TARGET_LEVEL_OPTIONS[0];
  return (
    <div className="absolute top-3 right-3 z-20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/55 backdrop-blur text-white text-xs font-medium hover:bg-black/70 transition-colors cursor-pointer"
      >
        <span
          className={cn("w-2 h-2 rounded-full", levelDotClass(current.color))}
        />
        {current.label}
        <ChevronDown
          size={13}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-canvas border border-hairline rounded-lg shadow-lift p-1 min-w-[120px]">
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
                    : "text-ink hover:bg-surface-soft",
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    levelDotClass(opt.color),
                  )}
                />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
