"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { PaperRunner } from "@/components/practice/PaperRunner";
import { SAMPLE_PAPER } from "@/data/practicePaper";
import { EXAM_LEVELS, levelDotClass } from "@/lib/examLevels";
import { cn } from "@/lib/utils";

/** 6 个练习层级（与 hub 一致）。 */
const PRACTICE_LEVELS = EXAM_LEVELS.filter((l) =>
  ["zhongkao", "gaoKao", "cet4", "cet6", "ielts", "toefl"].includes(l.key)
);

/** 层级 -> 考试时长（分钟），取自原型 06；原型统一限制 30 分钟。 */
const LEVEL_TIME_MIN: Record<string, number> = {
  zhongkao: 30,
  gaoKao: 30,
  cet4: 30,
  cet6: 30,
  ielts: 30,
  toefl: 30,
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PracticeExamPage() {
  const params = useSearchParams();
  const initialLevel = params.get("level") ?? "cet4";
  const videoId = params.get("videoId");

  const [level, setLevel] = useState(
    PRACTICE_LEVELS.some((l) => l.key === initialLevel) ? initialLevel : "cet4"
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [stopped, setStopped] = useState(false);

  const levelMeta = useMemo(
    () => PRACTICE_LEVELS.find((l) => l.key === level) ?? PRACTICE_LEVELS[0],
    [level]
  );

  const totalSec = (LEVEL_TIME_MIN[level] ?? 30) * 60;
  const [timeLeft, setTimeLeft] = useState(totalSec);

  // Reset timer on level change.
  useEffect(() => {
    setTimeLeft((LEVEL_TIME_MIN[level] ?? 30) * 60);
    setStopped(false);
  }, [level]);

  // Countdown.
  useEffect(() => {
    if (stopped) return;
    const id = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [stopped]);

  const warn = timeLeft <= 60;

  return (
    <PaperRunner
      key={level}
      paper={SAMPLE_PAPER}
      mode="submit"
      levelLabel={levelMeta.label}
      onSubmit={() => setStopped(true)}
      examHeaderExtra={
        <>
          {/* Level selector */}
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-card text-[13px] font-semibold text-ink"
            >
              <span className={cn("w-2 h-2 rounded-full", levelDotClass(levelMeta.color))} />
              {levelMeta.label}
              <ChevronDown
                size={13}
                className={cn("transition-transform", menuOpen && "rotate-180")}
              />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 mt-1.5 z-20 min-w-[140px] p-1.5 bg-canvas border border-hairline rounded-lg shadow-lift">
                  {PRACTICE_LEVELS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setLevel(opt.key);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[13px] font-medium text-left transition-colors",
                        opt.key === level
                          ? "bg-brand-50 text-brand-600 font-semibold"
                          : "text-body hover:bg-surface-soft"
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
          <span className="text-sm font-semibold text-ink hidden sm:inline">
            {videoId ? "视频试卷考试" : "水平检测"}
          </span>
          {/* Timer */}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill font-mono text-[13px] font-semibold",
              warn ? "bg-warning-soft text-warning" : "bg-surface-card text-ink"
            )}
          >
            {formatTime(timeLeft)}
          </span>
        </>
      }
    />
  );
}
