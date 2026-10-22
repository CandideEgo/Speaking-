"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  SECTION_LABELS,
  deriveOptions,
  stripWordBank,
  catalogReturnHref,
} from "@/lib/examPresentation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import type { ExamSubmitResultItem } from "@/components/exam/ExamRunner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabPills } from "@/components/ui/TabPills";
import { LinkButton } from "@/components/ui/LinkButton";

interface AttemptDetail {
  id: string;
  mode: string;
  paper_id: string | null;
  question_count: number;
  submitted: boolean;
  part_scores: Record<string, { correct: number; total: number }> | null;
  results: ExamSubmitResultItem[];
}
export default function ExamResultPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const returnTo = catalogReturnHref(search.get("return_to"));
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState<"all" | "wrong" | null>(null);
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    let cancelled = false;
    setError(null);
    setAttempt(null);
    setFilter(null);
    api<AttemptDetail>(`/api/v1/exams/attempts/${params.id}`)
      .then((next) => {
        if (!cancelled) setAttempt(next);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "成绩加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, isAuthenticated, isLoading, retry]);
  const results = useMemo(() => attempt?.results ?? [], [attempt]);
  const wrong = results.filter((r) => r.correct === false);
  const correct = results.filter((r) => r.correct === true).length;
  const activeFilter = filter ?? (wrong.length ? "wrong" : "all");
  const visible = activeFilter === "wrong" ? wrong : results;
  if (isLoading || !isAuthenticated) return <FullPageSpinner />;
  if (error)
    return (
      <div className="user-page">
        <ErrorState title="成绩加载失败" message={error} onRetry={() => setRetry((v) => v + 1)} />
      </div>
    );
  if (!attempt) return <FullPageSpinner />;
  if (!attempt.submitted)
    return (
      <div className="user-page">
        <p className="text-copy text-body">本次作答尚未提交，没有可查看的成绩。</p>
        <Link href={returnTo}>返回真题目录</Link>
      </div>
    );
  const suffix = `return_to=${encodeURIComponent(returnTo)}`;
  const retryHref = attempt.paper_id
    ? `/practice/exams/${attempt.paper_id}?${suffix}`
    : attempt.mode === "daily_check"
      ? "/practice/daily"
      : "/practice/exams/redo";
  return (
    <div className="user-page">
      <Link href={returnTo} className="text-copy text-muted hover:text-ink">
        返回真题目录
      </Link>
      <PageHeader
        className="mt-4"
        crumb="作答结果"
        title={`答对 ${correct} / ${attempt.question_count} 题`}
        description="只记答对题数，不预测考试分数或换算等级。"
        actions={
          <>
            {wrong.length > 0 && (
              <LinkButton
                href={`/practice/exams/redo?ids=${wrong.map((r) => r.question_id).join(",")}&${suffix}`}
                size="nav"
              >
                重做错题
              </LinkButton>
            )}
            <LinkButton href={retryHref} variant="outline" size="nav">
              再做一遍
            </LinkButton>
            <LinkButton href={returnTo} variant="outline" size="nav">
              换一套
            </LinkButton>
          </>
        }
      />
      <section className="mt-6" aria-label="题型表现">
        <h2 className="user-sec-title">题型表现</h2>
        <ul className="mt-3 flex flex-wrap gap-6">
          {Object.entries(attempt.part_scores ?? {}).map(([section, score]) => (
            <li key={section} className="border-t border-hairline pt-3 text-copy text-body">
              {SECTION_LABELS[section] ?? section}
              <span className="ml-3 font-semibold text-ink">
                {score.correct} / {score.total}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-8" aria-label="每题回顾">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="user-sec-title">每题回顾</h2>
          <TabPills
            variant="chips"
            tabs={[
              { key: "wrong", label: `只看错题 ${wrong.length} 道` },
              { key: "all", label: `全部 ${results.length} 题` },
            ]}
            activeKey={activeFilter}
            onChange={setFilter}
          />
        </div>
        {!visible.length && <p className="py-6 text-muted">本次没有错题。</p>}
        <ol className="mt-4 divide-y divide-hairline">
          {visible.map((r) => {
            const options = r.options ?? deriveOptions({ ...r, id: r.question_id })?.options;
            return (
              <li key={r.question_id} className="py-5" aria-label={`第 ${r.number} 题回顾`}>
                <h3 className="text-copy font-semibold leading-relaxed text-ink">
                  {r.number}. {r.question ?? "请选择答案"}
                </h3>
                <p className="mt-3 text-copy text-body">
                  你的答案：
                  <strong className={r.correct ? "text-success-text" : "text-error-text"}>
                    {r.user_answer || "未作答"}
                  </strong>
                  <span className="mx-3">·</span>正确答案：
                  <strong className="text-success-text">{r.correct_answer ?? "—"}</strong>
                  <span className="ml-3">{r.correct ? "✓ 答对" : "× 答错"}</span>
                </p>
                {options && (
                  <ul className="mt-3 space-y-2 text-copy text-body">
                    {Object.entries(options).map(([key, text]) => (
                      <li key={key}>
                        {key}. {text}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 whitespace-pre-wrap text-copy leading-relaxed text-body">
                  <span className="font-semibold text-ink">解析：</span>
                  {r.explanation || "本题暂无解析，可展开原文核对。"}
                </p>
                {r.passage && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-meta font-semibold text-brand-700">
                      展开原文
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap border-l-2 border-hairline pl-4 text-copy leading-loose text-body">
                      {stripWordBank(r.passage)}
                    </p>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
