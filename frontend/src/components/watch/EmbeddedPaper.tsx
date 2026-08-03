"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Info, Loader2 } from "lucide-react";
import { PaperRunner } from "@/components/practice/PaperRunner";
import {
  getVideoPaper,
  drillToPaper,
  useInstantPracticeSubmit,
  type ExamQuestionDTO,
} from "@/lib/examData";
import { EXAM_LEVELS, levelDotClass } from "@/lib/examLevels";
import { cn } from "@/lib/utils";
import type { Paper } from "@/data/practicePaper";

/**
 * watch 页内嵌练习试卷区（复刻原型 05-watch.html 的 .paper-section）。
 *
 * 题目来自 GET /videos/{id}/paper（按 videoId + level 生成），即时模式
 * 客户端判分；作答结果经 POST /videos/practice/submit 回写掌握度
 * （当前即时模式仅本地判分展示，掌握度回写由词汇练习流承担）。
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
  const [paper, setPaper] = useState<Paper | null>(null);
  const [ordered, setOrdered] = useState<ExamQuestionDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPaper(null);
    setLoadError(null);
    getVideoPaper(videoId, level)
      .then((res) => {
        if (cancelled) return;
        const { paper: p, ordered: o } = drillToPaper(res.items, true);
        setPaper(p);
        setOrdered(o);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "练习加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, level]);

  // Instant-mode judgements write back SM-2 mastery (debounced batch).
  const onInstantJudged = useInstantPracticeSubmit(videoId, ordered, `${videoId}-${level}`);

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

      {/* level-switcher：6 级切换，联动 selectedExamLevel；切换时重新拉卷 */}
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
      {!paper && !loadError && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Loader2 size={16} className="animate-spin text-brand-500" />
          正在生成练习…
        </div>
      )}
      {loadError && (
        <div className="flex items-center gap-2 px-3.5 py-3 bg-red-soft rounded-lg text-[13px] text-error">
          <Info size={14} className="shrink-0" />
          {loadError}
        </div>
      )}
      {paper && paper.length > 0 && (
        <PaperRunner
          key={`${videoId}-${level}`}
          paper={paper}
          mode="instant"
          variant="embedded"
          onInstantJudged={onInstantJudged}
        />
      )}
      {paper && paper.length === 0 && (
        <div className="px-3.5 py-3 bg-surface-card rounded-lg text-[13px] text-muted">
          该层级暂无可生成的练习题，换个层级试试。
        </div>
      )}

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
