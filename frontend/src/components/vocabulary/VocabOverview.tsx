"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { LinkButton } from "@/components/ui/LinkButton";
import { Skeleton } from "@/components/common/SkeletonCard";
import type { VocabSet } from "@/types";

/**
 * 词汇页首屏概览（设计 `vocabs()`：due-card + stats-grid + set-grid）。
 *
 * 保留现有「复习 / 词库」视图在其下方：设计给的是「今天该做什么」的概览，
 * 深度训练与词单管理仍是独立流程。概览里的数字全部来自 `/vocabulary/stats`
 * 与真实词单接口，不做占位。
 */
export function VocabOverview({
  total,
  due,
  learning,
  mastered,
  fresh,
  sets,
  setsLoading,
  setsError,
  onRetrySets,
}: {
  total: number;
  due: number;
  learning: number;
  mastered: number;
  fresh: number;
  sets: VocabSet[];
  setsLoading: boolean;
  setsError: string | null;
  onRetrySets: () => void;
}) {
  const dueTitle = due > 0 ? "先处理到期的词" : "今天的到期词已经清空";
  const dueHref = due > 0 ? "/vocabulary/review" : "/vocabulary?tab=library&sub=words";
  const stats = [
    { label: "全部词汇", value: total, hint: "来自视频与真题" },
    { label: "学习中", value: learning, hint: "还在建立记忆" },
    { label: "已掌握", value: mastered, hint: "复习间隔已拉长" },
    { label: "新词", value: fresh, hint: "还没有开始复习" },
  ];

  return (
    <div className="mt-5" data-testid="vocab-overview">
      <section className="rounded-lg bg-ink p-5 text-canvas sm:p-6" aria-label="今日复习概览">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-caption font-semibold tracking-[0.12em] uppercase text-on-dark/60">
                今天复习
              </p>
              <span
                className={`inline-flex h-6 items-center rounded-sm px-2 text-caption font-semibold ${
                  due > 0 ? "bg-canvas text-ink" : "bg-action-primary text-on-primary"
                }`}
              >
                {due > 0 ? "待复习" : "已完成"}
              </span>
            </div>
            <h2 className="mt-2 text-title font-semibold tracking-tight text-canvas">{dueTitle}</h2>
            <p className="mt-3 flex items-baseline gap-1.5">
              <strong className="text-[42px] leading-none font-semibold tabular-nums text-canvas">
                {due}
              </strong>
              <span className="text-copy text-on-dark/70">个到期</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={dueHref} variant="secondary" icon={Play}>
              {due > 0 ? "开始复习" : "看全部词汇"}
            </LinkButton>
            <LinkButton
              href="/vocabulary?tab=library&sub=words"
              variant="ghostDark"
              className="text-on-dark"
            >
              全部 {total} 词
            </LinkButton>
          </div>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4" aria-label="词库统计">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-hairline bg-canvas p-4">
            <p className="text-[26px] leading-none font-semibold tabular-nums text-ink">
              {stat.value}
            </p>
            <p className="mt-2 text-meta font-semibold text-ink">{stat.label}</p>
            <p className="mt-1 text-caption text-muted">{stat.hint}</p>
          </div>
        ))}
      </div>

      {(setsLoading || sets.length > 0) && (
        <section className="mt-8" aria-labelledby="vocab-sets-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="vocab-sets-title" className="text-title font-semibold tracking-tight text-ink">
              词单
            </h2>
            <Link
              href="/vocabulary/sets"
              className="inline-flex min-h-11 items-center text-meta font-semibold text-muted transition-colors hover:text-ink"
            >
              全部词单 →
            </Link>
          </div>

          {setsError ? (
            <button
              type="button"
              onClick={onRetrySets}
              className="mt-3 inline-flex min-h-11 items-center text-meta font-semibold text-brand-700 hover:underline"
            >
              词单加载失败，点击重试
            </button>
          ) : setsLoading ? (
            <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-md border border-hairline bg-canvas p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-3 h-1.5 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {sets.slice(0, 6).map((set) => {
                const progress =
                  set.total > 0
                    ? Math.min(100, Math.round((set.mastered_count / set.total) * 100))
                    : 0;
                return (
                  <Link
                    key={set.id}
                    href={`/vocabulary/sets/${set.id}`}
                    className="group rounded-md border border-hairline bg-canvas p-4 transition-colors hover:border-hairline-strong"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 text-copy font-semibold text-ink group-hover:text-brand-700">
                        {set.title}
                      </p>
                      <span className="flex-none rounded-sm bg-surface-card px-2 py-0.5 text-caption tabular-nums text-body">
                        {set.total} 词
                      </span>
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-pill bg-surface-card">
                      <span
                        className="block h-full rounded-pill bg-ink"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-caption text-muted">
                      {set.mastered_count}/{set.total} 已掌握
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
