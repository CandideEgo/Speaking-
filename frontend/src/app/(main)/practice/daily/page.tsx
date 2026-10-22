"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Target } from "lucide-react";
import { api } from "@/lib/api";
import { subjectLabel } from "@/lib/examSubjects";
import { toastApiError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/common/ErrorState";
import ExamRunner, {
  type ExamQuestionPublic,
  type ExamSubmitResponse,
} from "@/components/exam/ExamRunner";

interface Recommendation {
  token: string;
  title: string;
  reason: string;
  level: string;
  question_count: number;
  question_type: string;
  group_count: number;
  passage: string | null;
}
interface Attempt {
  session_id: string;
  questions: ExamQuestionPublic[];
}
interface PracticeSummary {
  recent: { id: string; title: string; correct: number; total: number; submitted_at: string }[];
}
interface WrongItem {
  question_id: string;
  question: string | null;
  paper_title: string | null;
  wrong_count: number;
}

const TYPE_LABELS: Record<string, string> = {
  reading: "仔细阅读",
  matching: "长篇匹配",
  cloze: "选词填空",
};

const LINK_OUTLINE =
  "inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-canvas px-4 py-2 text-copy font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-soft";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 建议用时（约）：按每题 1.4 分钟折算；每日一组不计时，只给参考。 */
function suggestedMinutesFor(count: number): number {
  return Math.max(3, Math.round(count * 1.4));
}

/**
 * 每日一组（stage-3 保真版）。
 *
 * 设计 daily.html 的信息层：今日推荐（标题 + 题量/时长 + 推荐理由）
 * → 计划构成（逐项 + 合计）→「这一组怎么来的」范围说明
 * → 右栏（上次练习 / 推荐依据 / 关于每日练）；可以跳过（不写记录）也可以换一组。
 */
export default function DailyCheckPage() {
  const router = useRouter();
  const type = useSearchParams().get("type");
  const questionType = ["reading", "cloze", "matching"].includes(type || "") ? type : null;
  const [variant, setVariant] = useState(0);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const [wrongs, setWrongs] = useState<WrongItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setRecommendation(null);
    setError(null);
    api<Recommendation>(
      `/api/v1/discovery/daily?variant=${variant}${questionType ? `&question_type=${questionType}` : ""}`,
      { signal: controller.signal }
    )
      .then(setRecommendation)
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "推荐加载失败");
      });
    return () => controller.abort();
  }, [variant, questionType]);

  // 右栏「上次练习 / 推荐依据」的数据。失败静默：推荐本身仍可用。
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<PracticeSummary>("/api/v1/discovery/practice-summary", {
        signal: controller.signal,
      }).catch(() => ({ recent: [] })),
      api<{ items: WrongItem[]; total: number }>("/api/v1/exams/wrong?page=1&page_size=3", {
        signal: controller.signal,
      }).catch(() => ({ items: [], total: 0 })),
    ]).then(([s, w]) => {
      if (controller.signal.aborted) return;
      setSummary(s);
      setWrongs(w.items);
    });
    return () => controller.abort();
  }, []);

  async function start() {
    if (!recommendation || busy) return;
    setBusy(true);
    try {
      setAttempt(
        await api<Attempt>("/api/v1/discovery/daily/start", {
          method: "POST",
          body: JSON.stringify({ token: recommendation.token }),
        })
      );
    } catch (err) {
      toastApiError(err, "开始失败，请重新获取推荐");
    } finally {
      setBusy(false);
    }
  }

  if (attempt)
    return (
      <div className="user-page">
        <Link href="/practice" className="text-meta text-muted hover:text-ink">
          ← 返回练习
        </Link>
        <div className="mt-4">
          <ExamRunner
            questions={attempt.questions}
            submitPath={`/api/v1/exams/attempts/${attempt.session_id}/submit`}
            accent="每日一组"
            suggestedMinutes={null}
            onSubmitted={(result: ExamSubmitResponse) =>
              router.push(`/practice/exams/result/${result.session_id}`)
            }
          />
        </div>
      </div>
    );

  const lastPractice = summary?.recent[0];
  const typeLabel = recommendation
    ? (TYPE_LABELS[recommendation.question_type] ?? recommendation.question_type)
    : "";
  const minutes = recommendation ? suggestedMinutesFor(recommendation.question_count) : 0;

  return (
    <div className="user-page">
      <PageHeader
        crumb="每日练 · 可选"
        title="今天，就练这一组"
        description="按上次错题类型推荐。不是每日任务：可以跳过、可以换一组，不计时、不倒数，跳过也不会留下记录。"
        actions={
          recommendation ? (
            <>
              <Button onClick={start} disabled={busy || skipped}>
                {busy ? "准备中…" : "开始这一组"}
              </Button>
              <Button
                variant="outline"
                disabled={busy || skipped || recommendation.group_count < 2}
                onClick={() => setVariant((v) => v + 1)}
              >
                换一组
              </Button>
              <button
                type="button"
                onClick={() => setSkipped(true)}
                className="inline-flex items-center px-2 py-2 text-copy font-medium text-body underline underline-offset-4 hover:text-ink"
              >
                今天跳过
              </button>
            </>
          ) : undefined
        }
      />

      {error ? (
        <ErrorState title={error} onRetry={() => setVariant((v) => v + 1)} />
      ) : !recommendation ? (
        <p role="status" className="py-12 text-muted">
          正在准备练习…
        </p>
      ) : (
        <div className="user-page-layout has-aside">
          <div className="user-page-main">
            {skipped ? (
              <section className="rounded-md border border-hairline bg-surface-soft p-5">
                <h2 className="text-copy-lg font-bold text-ink">今天这一组已跳过</h2>
                <p className="mt-2 text-copy leading-relaxed text-body">
                  跳过就是跳过：不显示连击惩罚、也不会在明天补一次。想练的时候，这一组还在，或者直接去套卷里挑一套。
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={() => setSkipped(false)}>恢复这一组</Button>
                  <Link href="/practice/exams" className={LINK_OUTLINE}>
                    去套卷列表
                  </Link>
                </div>
              </section>
            ) : (
              <section aria-labelledby="daily-plan-title">
                <div className="user-sec-head">
                  <h2 id="daily-plan-title" className="user-sec-title">
                    {recommendation.title}
                  </h2>
                  <span className="user-sec-sub">
                    {recommendation.question_count} 题 · 约 {minutes} 分钟 · 不计时
                  </span>
                </div>

                <p className="mt-4 flex items-start gap-2 rounded-md border border-hairline bg-surface-soft p-4 text-copy leading-relaxed text-body">
                  <Target size={18} className="mt-0.5 flex-none text-muted" />
                  <span>
                    <strong className="text-ink">为什么推荐这一组：</strong>
                    {recommendation.reason}
                  </span>
                </p>

                <ol className="mt-5 divide-y divide-hairline border-y border-hairline">
                  <li className="flex items-baseline justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-2 text-caption text-muted">
                        <span className="font-mono">01</span>
                        <span className="text-copy font-semibold text-ink">{typeLabel}</span>
                        <span className="rounded-sm bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-700">
                          {subjectLabel(recommendation.level)}
                        </span>
                      </p>
                      <p className="mt-1 text-meta text-muted">
                        完整题组 · {recommendation.question_count} 题
                      </p>
                    </div>
                    <span className="flex-none text-meta text-body">约 {minutes} 分钟</span>
                  </li>
                </ol>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-5">
                  <p className="text-meta text-muted">
                    合计 <strong className="text-ink">{recommendation.question_count}</strong> 题 ·
                    约 <strong className="text-ink">{minutes}</strong> 分钟 · 不计时
                  </p>
                </div>

                <details className="mt-5 border-b border-hairline pb-4">
                  <summary className="cursor-pointer text-meta font-semibold text-ink">
                    文章预览
                  </summary>
                  {recommendation.passage ? (
                    <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-copy leading-relaxed text-muted">
                      {recommendation.passage}
                    </p>
                  ) : (
                    <p className="mt-3 text-copy text-muted">
                      这一组没有文章预览（选词填空/词汇题）。
                    </p>
                  )}
                </details>
              </section>
            )}

            <section aria-labelledby="daily-scope-title">
              <div className="user-sec-head">
                <h2 id="daily-scope-title" className="user-sec-title">
                  这一组怎么来的
                </h2>
                <span className="user-sec-sub">根据最近练习推荐</span>
              </div>
              <ul className="mt-4 flex flex-col gap-2 text-copy leading-relaxed text-body">
                <li>
                  · 题量按完整题组给（{typeLabel} · {recommendation.question_count} 题）。
                </li>
                <li>· 换一组可以选择同类型的其他练习。</li>
                <li>· 不预测考试分数、不给等级换算；答完只看这组答对多少题。</li>
              </ul>
            </section>
          </div>

          <aside className="user-page-aside" aria-label="推荐依据与最近记录">
            <section className="user-aside-sec">
              <h2 className="user-aside-title">上次练习</h2>
              {lastPractice ? (
                <>
                  <div className="user-kv">
                    <div className="user-kv-row">
                      <span className="user-kv-key">内容</span>
                      <span className="user-kv-val">{lastPractice.title}</span>
                    </div>
                    <div className="user-kv-row">
                      <span className="user-kv-key">成绩</span>
                      <span className="user-kv-val font-mono">
                        {lastPractice.correct} / {lastPractice.total}
                      </span>
                    </div>
                    <div className="user-kv-row">
                      <span className="user-kv-key">日期</span>
                      <span className="user-kv-val">{formatDate(lastPractice.submitted_at)}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-caption leading-relaxed text-muted">
                    只记答对题数，不折算等级。
                  </p>
                  {wrongs.length > 0 && (
                    <Link
                      href="/practice/exams/redo"
                      className="mt-2 inline-block text-meta font-medium text-ink underline underline-offset-2"
                    >
                      回看 {wrongs.length} 道错题
                    </Link>
                  )}
                </>
              ) : (
                <p className="text-meta leading-relaxed text-body">
                  还没有练习记录。开始第一组后，这里会显示上次练了什么、答对多少。
                </p>
              )}
            </section>

            <section className="user-aside-sec">
              <h2 className="user-aside-title">推荐依据</h2>
              <ul className="flex flex-col gap-2 text-meta leading-relaxed text-body">
                <li>· {recommendation.reason}</li>
                {wrongs.length > 0 && (
                  <li>
                    · 上次错题 {wrongs.length} 道
                    {wrongs[0]?.paper_title ? `（${wrongs[0].paper_title}）` : ""}，优先补同类题。
                  </li>
                )}
                <li>· 换一组可以选择同类型的其他练习。</li>
              </ul>
              <p className="mt-3 text-caption leading-relaxed text-muted">
                题量随完整文章变化。只有交卷后才计入学习统计。
              </p>
            </section>

            <section className="user-aside-sec">
              <h2 className="user-aside-title">关于每日练</h2>
              <p className="text-meta leading-relaxed text-body">
                不是每日任务，也不做连击惩罚：这里不显示连续天数，也不会因为断一天就清零——连续学习天数在首页和「我的」看。
                这一组没有倒数计时，跳过后不扣分、也不补练，只是「今天可以先练这些」的建议。
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
