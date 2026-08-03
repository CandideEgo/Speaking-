"use client";

import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { PaperRunner } from "@/components/practice/PaperRunner";
import { SAMPLE_PAPER } from "@/data/practicePaper";
import { EXAM_LEVELS, levelDotClass } from "@/lib/examLevels";
import { cn } from "@/lib/utils";

/**
 * watch 页内嵌练习试卷区（复刻原型 05-watch.html 的 .paper-section）。
 *
 * 后端整卷生成能力就绪前，题目用硬编码 SAMPLE_PAPER（取自原型 06/16，主题
 * 「为什么我们做梦」）；后端就绪后改为按 videoId + level 拉 API 替换。
 * 见 data/practicePaper.ts 顶部注释与 docs/plans/FRONTEND-REFACTOR-2026-07.md 阶段1b。
 */

/** 试卷层级切换器展示的 6 级（与原型一致；排除考研/GRE）。 */
const PAPER_LEVELS = EXAM_LEVELS.filter((l) =>
  ["zhongkao", "gaoKao", "cet4", "cet6", "ielts", "toefl"].includes(l.key)
);

export function EmbeddedPaper({
  videoId,
  level,
  onLevelChange,
}: {
  videoId: string;
  level: string;
  onLevelChange: (lv: string) => void;
}) {
  return (
    <section className="mt-8">
      {/* paper-head：标题 + 标签 + 进入专注答题 CTA */}
      <div className="flex items-center justify-between mb-3.5 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-bold tracking-tight text-ink">本视频练习试卷</h2>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-pill bg-brand-50 text-brand-600">
            按考试层级生成
          </span>
        </div>
        <Link
          href={`/practice/paper/${videoId}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ink text-canvas text-[13px] font-semibold transition-all hover:-translate-y-px hover:shadow-soft"
        >
          进入专注答题
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* level-switcher：6 级切换，联动 selectedExamLevel；切换时 key 变化 -> PaperRunner 重建 -> 重置答题 */}
      <div className="flex gap-1 p-1 bg-surface-card rounded-xl overflow-x-auto mb-4">
        {PAPER_LEVELS.map((lv) => {
          const active = lv.key === level;
          return (
            <button
              key={lv.key}
              type="button"
              onClick={() => onLevelChange(lv.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all cursor-pointer",
                active
                  ? "bg-canvas text-ink font-semibold shadow-soft"
                  : "text-muted hover:text-ink"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", levelDotClass(lv.color))} />
              {lv.label}
            </button>
          );
        })}
      </div>

      {/* 即时练习：一屏多题，点选项即时判分 + 解析（PaperRunner instant 模式） */}
      <PaperRunner key={level} paper={SAMPLE_PAPER} mode="instant" variant="embedded" />

      {/* note-future：真题试卷说明 */}
      <div className="mt-3.5 flex items-center gap-2 px-3.5 py-2.5 bg-warning-soft rounded-lg text-[12px] text-muted">
        <Info size={14} className="shrink-0" />
        <span>
          试卷由视频字幕与考点词汇自动生成；真题试卷（四六级/雅思/托福原题）将在
          <Link href="/practice" className="text-brand-600 font-semibold mx-0.5 hover:underline">
            练习专题
          </Link>
          陆续上线。
        </span>
      </div>
    </section>
  );
}
