"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ExamSubmitResultItem } from "@/components/exam/ExamRunner";

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
  reading_A: "Section A · 选词填空",
  reading_B: "Section B · 段落匹配",
  reading_C: "Section C · 仔细阅读",
};

export default function ExamResultPage() {
  const params = useParams<{ id: string }>();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isLoading || !params.id) return;
    let cancelled = false;
    api<AttemptDetail>(`/api/v1/exams/attempts/${params.id}`)
      .then((data) => !cancelled && setAttempt(data))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "加载失败"));
    return () => {
      cancelled = true;
    };
  }, [params.id, isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  if (error || !attempt) {
    return (
      <main className="min-h-full bg-surface-soft">
        <div className="container-page py-16 text-center">
          <p className="text-sm text-muted">{error ?? "加载中…"}</p>
        </div>
      </main>
    );
  }

  const pct = Math.round((attempt.score ?? 0) * 100);
  const wrong = attempt.results.filter((r) => r.correct === false);
  const sections = Object.entries(attempt.part_scores ?? {});

  // 「再做一遍」目标：真题卷重开同卷；每日小测重新抽题；错题重做再重做。
  const retryHref = attempt.paper_id
    ? `/practice/exams/${attempt.paper_id}`
    : attempt.mode === "daily_check"
      ? "/practice/daily"
      : "/practice/exams/redo";
  const wrongIdsHref = wrong.length
    ? `/practice/exams/redo?ids=${wrong.map((r) => r.question_id).join(",")}`
    : null;

  return (
    <main className="min-h-full bg-surface-soft">
      <div className="container-page py-8 pb-24 max-w-[880px]">
        <Link
          href="/practice/exams"
          className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          返回真题列表
        </Link>

        {/* Score card */}
        <div className="bg-canvas border border-hairline rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="var(--color-hairline, #e5e7eb)"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="var(--color-brand-500, #f97316)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(attempt.score ?? 0) * 264} 264`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xl font-extrabold text-ink">
                {pct}%
              </span>
            </div>
            <div className="flex-1 min-w-[200px]">
              <h1 className="text-lg font-extrabold text-ink mb-1">
                {pct >= 80 ? "太棒了！" : pct >= 60 ? "不错，继续加油！" : "再接再厉！"}
              </h1>
              <p className="text-[13px] text-muted">
                答对 {attempt.results.filter((r) => r.correct).length} / {attempt.question_count} 题
                {attempt.mode === "daily_check" ? " · 每日小测" : " · 真题卷"}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {sections.map(([section, s]) => (
                  <span
                    key={section}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-pill bg-surface-card text-muted"
                  >
                    {SECTION_LABELS[section]?.split(" · ")[1] ?? section}
                    <span className={s.correct === s.total ? "text-brand-600" : "text-error-600"}>
                      {s.correct}/{s.total}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {wrongIdsHref && (
                <Link
                  href={wrongIdsHref}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-canvas border border-hairline-strong text-ink text-[13px] font-semibold hover:border-ink hover:bg-surface-soft transition-colors flex-shrink-0"
                >
                  <RotateCcw size={14} />
                  只练错题（{wrong.length}）
                </Link>
              )}
              <Link
                href={retryHref}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-canvas border border-hairline-strong text-ink text-[13px] font-semibold hover:border-ink hover:bg-surface-soft transition-colors flex-shrink-0"
              >
                <RotateCcw size={14} />
                再做一遍
              </Link>
              <Link
                href="/practice/exams"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-ink text-canvas text-[13px] font-semibold hover:bg-brand-500 transition-colors flex-shrink-0"
              >
                再练一套
              </Link>
            </div>
          </div>
        </div>

        {/* Wrong answers review */}
        {wrong.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-ink">错题解析</h2>
            {wrong.map((r) => (
              <div key={r.question_id} className="bg-canvas border border-hairline rounded-xl p-5">
                {r.passage ? (
                  <p className="text-[13px] leading-relaxed text-muted whitespace-pre-wrap mb-4">
                    {r.passage}
                  </p>
                ) : null}
                {r.question ? (
                  <p className="text-[14px] font-semibold text-ink mb-3">
                    {r.number}. {r.question}
                  </p>
                ) : (
                  <p className="text-[14px] font-semibold text-ink mb-3">第 {r.number} 题</p>
                )}
                <div className="grid gap-1.5">
                  {r.options &&
                    Object.entries(r.options).map(([key, text]) => {
                      const isUser = r.user_answer === key;
                      const isCorrect = r.correct_answer === key;
                      return (
                        <div
                          key={key}
                          className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2 text-[13px] ${
                            isCorrect
                              ? "border-brand-400 bg-brand-50 text-ink"
                              : isUser
                                ? "border-error-300 bg-error-50 text-ink"
                                : "border-hairline text-muted"
                          }`}
                        >
                          <span className="font-bold flex-shrink-0 mt-0.5">
                            {isCorrect ? (
                              <CheckCircle2 size={15} className="text-brand-600" />
                            ) : isUser ? (
                              <XCircle size={15} className="text-error-600" />
                            ) : (
                              key
                            )}
                          </span>
                          <span className="leading-relaxed">{text}</span>
                        </div>
                      );
                    })}
                  {!r.options && (
                    <p className="text-[13px] text-muted">
                      你的答案：
                      <span className="font-bold text-error-600">{r.user_answer ?? "未作答"}</span>
                      <span className="mx-2">·</span>
                      正确答案：<span className="font-bold text-brand-600">{r.correct_answer}</span>
                    </p>
                  )}
                </div>
                {r.explanation && (
                  <p className="text-[13px] text-muted leading-relaxed mt-3 border-t border-hairline pt-3">
                    {r.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {wrong.length === 0 && (
          <div className="text-center py-10 text-sm text-muted">全部答对，没有错题 🎉</div>
        )}
      </div>
    </main>
  );
}
