"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import { ExamSubmitResultItem } from "@/components/exam/ExamRunner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabPills } from "@/components/ui/TabPills";

interface AttemptDetail {
  id: string;
  mode: string;
  exam_level: string | null;
  paper_id: string | null;
  question_count: number;
  score: number | null;
  submitted: boolean;
  part_scores: Record<string, { correct: number; total: number }> | null;
  results: ExamSubmitResultItem[];
}

const SECTION_LABELS: Record<string, string> = {
  use_of_english: "Use of English · 完形填空",
  reading_A: "Section A · 选词填空",
  reading_B: "Section B · 段落匹配",
  reading_C: "Section C · 仔细阅读",
  new_type: "Part B · 新题型",
};

const SECTION_SHORT: Record<string, string> = {
  use_of_english: "完形填空",
  reading_A: "选词填空",
  reading_B: "段落匹配",
  reading_C: "仔细阅读",
  new_type: "新题型",
};

const MODE_LABELS: Record<string, string> = {
  exam: "真题卷",
  paper_exam: "真题卷",
  daily_check: "每日一组",
  wrong_redo: "错题重做",
};

const LINK_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-sm bg-brand-500 px-4 py-2 text-copy font-semibold text-on-primary transition-colors hover:bg-brand-600";
const LINK_OUTLINE =
  "inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-canvas px-4 py-2 text-copy font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-soft";

/**
 * 成绩页（stage-3 保真版）。
 *
 * P0 修复：不再把成绩换算成百分比、不再用「太棒了」这类评价式标题；
 * 页面只给「答对多少题 + 分项 + 每题对错」，并明确「不预测考试分数、
 * 不折算百分制/等级、不承诺提分」——与设计 exam-result.html 的口径一致。
 * 同时补齐「每题对错与回看」（全部/只看错题筛选、展开解析）与右栏说明。
 */
export default function ExamResultPage() {
  const params = useParams<{ id: string }>();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState<"all" | "wrong">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAuthenticated || isLoading || !params.id) return;
    let cancelled = false;
    setError(null);
    api<AttemptDetail>(`/api/v1/exams/attempts/${params.id}`)
      .then((data) => !cancelled && setAttempt(data))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "加载失败"));
    return () => {
      cancelled = true;
    };
  }, [params.id, isAuthenticated, isLoading, retry]);

  const results = useMemo(() => attempt?.results ?? [], [attempt]);
  const correct = results.filter((r) => r.correct).length;
  const wrong = results.filter((r) => r.correct === false);
  const sections = Object.entries(attempt?.part_scores ?? {});
  const modeLabel = MODE_LABELS[attempt?.mode ?? ""] ?? "练习";

  // 「再做一遍」目标：真题卷重开同卷；每日一组重新抽题；错题重做再重做。
  const retryHref = attempt?.paper_id
    ? `/practice/exams/${attempt.paper_id}`
    : attempt?.mode === "daily_check"
      ? "/practice/daily"
      : "/practice/exams/redo";
  const wrongIdsHref = wrong.length
    ? `/practice/exams/redo?ids=${wrong.map((r) => r.question_id).join(",")}`
    : null;

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  if (error || !attempt) {
    return (
      <div className="pt-6 pb-18">
        <Link
          href="/practice/exams"
          className="inline-flex items-center gap-1 text-copy text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          返回真题列表
        </Link>
        <ErrorState
          title={error ?? "正在读取成绩…"}
          message={error ? "成绩可能已被删除，或链接不完整。" : undefined}
          onRetry={error ? () => setRetry((v) => v + 1) : undefined}
          className="py-16"
        />
      </div>
    );
  }

  const visible = filter === "wrong" ? wrong : results;

  return (
    <div className="pt-6 pb-18">
      <Link
        href="/practice/exams"
        className="inline-flex items-center gap-1 text-copy text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} />
        返回真题列表
      </Link>

      <PageHeader
        className="mt-4"
        crumb="成绩页"
        title={`${modeLabel}（${attempt.question_count} 题）：答对 ${correct} 题`}
        description={`答对 ${correct} / ${attempt.question_count} 题 · 错 ${wrong.length} 题。只记答对题数，不预测考试分数、不折算等级，也不把练习时长换算成能力分。`}
        actions={
          <>
            {wrongIdsHref && (
              <Link href={wrongIdsHref} className={LINK_PRIMARY}>
                <RotateCcw size={14} />
                回看 {wrong.length} 道错题
              </Link>
            )}
            <Link href={retryHref} className={LINK_OUTLINE}>
              再做一遍
            </Link>
            <Link href="/practice/exams" className={LINK_OUTLINE}>
              换一套
            </Link>
          </>
        }
      />

      <div className="user-page-layout has-aside">
        <div className="user-page-main">
          {/* 总分：只给答对题数，不换算百分制 */}
          <section>
            <div className="user-sec-head">
              <h2 className="user-sec-title">总分</h2>
              <span className="user-sec-sub">只记答对题数 · 不换算百分制</span>
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-hairline pb-5">
              <div className="flex items-end gap-5">
                <p className="flex-none whitespace-nowrap text-[3rem] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
                  {correct}
                  <span className="ml-1 text-title font-bold text-muted">
                    / {attempt.question_count}
                  </span>
                </p>
                <div className="min-w-0 pb-1">
                  <p className="text-copy text-body">
                    答对 <strong className="text-ink">{correct}</strong> 题 · 错{" "}
                    <strong className="text-ink">{wrong.length}</strong> 题
                  </p>
                  <p className="mt-1 text-caption text-muted">
                    {wrong.length
                      ? `错题：${wrong
                          .map(
                            (r) => `第 ${r.number} 题（${SECTION_SHORT[r.section] ?? r.section}）`
                          )
                          .join("、")}`
                      : "本次没有错题。"}
                  </p>
                </div>
              </div>
              <p className="text-meta text-muted">{modeLabel}</p>
            </div>
          </section>

          {/* 分项 */}
          <section>
            <div className="user-sec-head">
              <h2 className="user-sec-title">分项</h2>
              <span className="user-sec-sub">按阅读小节拆开看</span>
            </div>
            {sections.length ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {sections.map(([section, s]) => (
                  <div key={section} className="border-t-2 border-hairline-strong pt-3">
                    <p className="text-meta text-body">{SECTION_LABELS[section] ?? section}</p>
                    <p className="mt-1 text-title font-bold text-ink tabular-nums">
                      {s.correct} / {s.total}
                    </p>
                    <p className="mt-1 text-caption text-muted">
                      {s.correct === s.total ? "本节全对" : `错 ${s.total - s.correct} 题`}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-copy text-muted">这次作答没有分项统计。</p>
            )}
            <p className="mt-3 text-caption leading-relaxed text-muted">
              分项只统计“这个小节答对几题”，不做加权、不折算百分制、不换算成任何等级。
            </p>
          </section>

          {/* 每题对错与回看 */}
          <section>
            <div className="user-sec-head">
              <h2 className="user-sec-title">每题对错与回看</h2>
              <TabPills
                variant="chips"
                tabs={[
                  { key: "all", label: `全部 ${results.length} 题` },
                  { key: "wrong", label: `只看错题 ${wrong.length} 道` },
                ]}
                activeKey={filter}
                onChange={(key) => setFilter(key)}
              />
            </div>
            {visible.length ? (
              <ol className="mt-4">
                {visible.map((r) => {
                  const open = !!expanded[r.question_id];
                  const typeLabel = SECTION_SHORT[r.section] ?? r.section;
                  return (
                    <li key={r.question_id} className="border-b border-hairline-soft">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                        <p className="min-w-0 text-copy text-body">
                          <span className="mr-2 font-mono text-caption text-muted">{r.number}</span>
                          <span className="font-semibold text-ink">
                            {r.question ?? `第 ${r.number} 题`}
                          </span>
                        </p>
                        <div className="flex flex-none items-center gap-3">
                          <span
                            className={`text-caption font-semibold ${
                              r.correct ? "text-success-text" : "text-error-text"
                            }`}
                          >
                            {r.correct ? "✓ 答对" : "× 答错"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [r.question_id]: !prev[r.question_id],
                              }))
                            }
                            aria-expanded={open}
                            className="text-caption font-medium text-ink underline underline-offset-2"
                          >
                            {open ? "收起解析" : "回看解析"}
                          </button>
                        </div>
                      </div>
                      <p className="pb-3 text-caption text-muted">
                        {typeLabel} · 你的选择：
                        <span
                          className={
                            r.correct
                              ? "font-semibold text-success-text"
                              : "font-semibold text-error-text"
                          }
                        >
                          {r.user_answer ?? "未作答"}
                        </span>
                        <span className="mx-2">·</span>
                        正确答案：
                        <span className="font-semibold text-success-text">
                          {r.correct_answer ?? "—"}
                        </span>
                      </p>

                      {open && (
                        <div className="space-y-3 pb-4">
                          {r.passage && (
                            <div className="rounded-md border border-hairline-soft bg-surface-soft px-4 py-3">
                              <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-caption leading-relaxed text-body">
                                {r.passage}
                              </p>
                            </div>
                          )}
                          {r.question && (
                            <p className="text-copy font-semibold leading-relaxed text-ink">
                              {r.number}. {r.question}
                            </p>
                          )}
                          {r.options ? (
                            <div className="grid gap-2">
                              {Object.entries(r.options).map(([key, text]) => {
                                const isCorrect = r.correct_answer === key;
                                const isUser = r.user_answer === key;
                                return (
                                  <div
                                    key={key}
                                    className={`flex items-start gap-2.5 rounded-sm border px-3.5 py-2 text-copy ${
                                      isCorrect
                                        ? "border-success bg-success-soft text-ink"
                                        : isUser
                                          ? "border-error bg-red-soft text-ink"
                                          : "border-hairline text-muted"
                                    }`}
                                  >
                                    <span className="mt-0.5 flex-shrink-0 font-bold">
                                      {isCorrect ? (
                                        <CheckCircle2 size={15} className="text-success-text" />
                                      ) : isUser ? (
                                        <XCircle size={15} className="text-error-text" />
                                      ) : (
                                        key
                                      )}
                                    </span>
                                    <span className="leading-relaxed">{text}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-copy text-muted">
                              你的答案：
                              <span className="font-bold text-error-text">
                                {r.user_answer ?? "未作答"}
                              </span>
                              <span className="mx-2">·</span>
                              正确答案：
                              <span className="font-bold text-success-text">
                                {r.correct_answer ?? "—"}
                              </span>
                            </p>
                          )}
                          {r.explanation && (
                            <p className="border-t border-hairline pt-3 text-meta leading-relaxed text-body">
                              {r.explanation}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="py-8 text-copy text-muted">全部答对，没有错题。</p>
            )}
            <p className="mt-3 text-caption leading-relaxed text-muted">
              「回看解析」展开后给出你的选择、正确答案、原文段落和解析；错题也可以整组重做一遍。
            </p>
          </section>

          {/* 下一步 */}
          <section>
            <div className="user-sec-head">
              <h2 className="user-sec-title">下一步</h2>
              <span className="user-sec-sub">三条路，随你挑</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {wrongIdsHref && (
                <Link href={wrongIdsHref} className={LINK_PRIMARY}>
                  只练错题（{wrong.length}）
                </Link>
              )}
              <Link href={retryHref} className={LINK_OUTLINE}>
                再做一遍这套
              </Link>
              <Link href="/practice/exams" className={LINK_OUTLINE}>
                换一套
              </Link>
              <Link
                href="/practice/daily"
                className="inline-flex items-center px-2 py-2 text-copy font-medium text-ink underline underline-offset-4"
              >
                回到每日练
              </Link>
            </div>
          </section>
        </div>

        <aside className="user-page-aside" aria-label="成绩说明">
          <section className="user-aside-sec">
            <h2 className="user-aside-title">如何看成绩</h2>
            <p className="text-meta leading-relaxed text-body">
              按答对题数查看本次表现，结合各题解析找出需要巩固的内容。
            </p>
          </section>
          <section className="user-aside-sec">
            <h2 className="user-aside-title">成绩记录</h2>
            <p className="text-meta leading-relaxed text-body">
              结果展示答对题数与各题表现，可展开解析回顾错题。
            </p>
          </section>
          <section className="user-aside-sec">
            <h2 className="user-aside-title">相关页面</h2>
            <ul className="flex flex-col gap-2 text-meta">
              <li>
                <Link href="/practice/exams/redo" className="text-ink underline underline-offset-2">
                  错题重做
                </Link>
              </li>
              <li>
                <Link href={retryHref} className="text-ink underline underline-offset-2">
                  重新作答这套卷
                </Link>
              </li>
              <li>
                <Link href="/practice/exams" className="text-ink underline underline-offset-2">
                  套卷列表
                </Link>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
