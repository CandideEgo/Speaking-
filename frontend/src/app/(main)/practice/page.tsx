"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { subjectLabel } from "@/lib/examSubjects";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/LinkButton";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/common/ErrorState";

interface Summary {
  types: Record<string, { group_count: number; question_count: number }>;
  recent: { id: string; title: string; correct: number; total: number; submitted_at: string }[];
}
interface Wrong {
  question_id: string;
  question: string | null;
  section: string | null;
  paper_title: string | null;
  wrong_count: number;
}
interface PaperItem {
  id: string;
  level: string;
  year: number;
  month: number;
  set_no: number;
  total_questions: number;
}

const TYPES = [
  {
    key: "reading",
    title: "仔细阅读",
    tag: "推荐",
    description: "先读文章，再定位细节、推断和词义；交卷后查看解析。",
  },
  {
    key: "cloze",
    title: "选词填空",
    description: "从词库里选词填进短文，先判断词性，再看前后搭配。",
  },
  {
    key: "matching",
    title: "长篇阅读",
    description: "把陈述匹配到对应段落，练快速定位和同义替换。",
  },
];

/** 正文内联文字链（带下划线）。按钮型 CTA 走 `ui/LinkButton`，这里只保留行内链接。 */
const LINK_TEXT = "text-copy font-medium text-ink underline underline-offset-4";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 建议用时：按真题阅读 30 题 / 40 分钟折算（设计 practice.html「按套卷练」的口径）。 */
function suggestedMinutesFor(count: number): number {
  return Math.max(4, Math.round((count * 40) / 30));
}

/**
 * 练习专题（stage-3 保真版）。
 *
 * 结构与设计 practice.html 对齐：
 * 页头（自由练习 / 日期）→ 上次练习（日期 + 标题 + 题量/用时口径 + 成绩 + 回看/再做）
 * → 按题型练（序号 + 标题 + 推荐 tag + 描述 + 题组规模 + 级别/开始）
 * → 按套卷练（最近一套的年份/级别/套/题量/建议用时 + 开始作答）
 * → 右栏（最近练习 / 这一版包含 / 关于结果）。
 */
export default function PracticePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [wrongs, setWrongs] = useState<Wrong[]>([]);
  const [wrongTotal, setWrongTotal] = useState(0);
  const [papers, setPapers] = useState<PaperItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    Promise.all([
      api<Summary>("/api/v1/discovery/practice-summary", { signal: controller.signal }),
      api<{ items: Wrong[]; total: number }>("/api/v1/exams/wrong?page=1&page_size=5", {
        signal: controller.signal,
      }),
      api<{ items: PaperItem[]; total: number }>("/api/v1/exams?level=cet6&page=1&page_size=3", {
        signal: controller.signal,
      }).catch(() => ({ items: [], total: 0 })),
    ])
      .then(([data, wrong, paperList]) => {
        setSummary(data);
        setWrongs(wrong.items);
        setWrongTotal(wrong.total);
        setPapers(paperList.items);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "练习加载失败");
      });
    return () => controller.abort();
  }, [retry]);

  const latest = summary?.recent[0];
  const today = new Date();
  const todayLabel = `${today.getMonth() + 1} 月 ${today.getDate()} 日 星期${
    "日一二三四五六"[today.getDay()]
  }`;
  const typeEntries = summary
    ? TYPES.map((t) => ({
        ...t,
        groupCount: summary.types[t.key]?.group_count ?? 0,
        questionCount: summary.types[t.key]?.question_count ?? 0,
      }))
    : [];

  return (
    <div className="user-page">
      <PageHeader
        crumb="练习"
        title="今天，练哪一部分？"
        description="真题阅读的三类题，按题型开始。每组 3–4 题，交卷后立刻看解析；不预测分数，也不安排每日任务。"
        actions={
          <div className="hidden flex-col items-end gap-1 text-right md:flex">
            <span className="text-meta font-semibold text-body">自由练习</span>
            <span className="text-caption text-muted">{todayLabel}</span>
            <Link href="/practice/daily" className="mt-1 text-meta font-medium text-brand-700">
              看看今天推荐的一组 →
            </Link>
          </div>
        }
      />

      {error ? (
        <ErrorState title={error} onRetry={() => setRetry((v) => v + 1)} />
      ) : !summary ? (
        <p role="status" className="py-12 text-muted">
          正在读取题库与练习记录…
        </p>
      ) : (
        <>
          {/* 上次练习 */}
          <section
            aria-label="上次练习"
            className="flex flex-col gap-3 border-y border-hairline py-4 md:flex-row md:items-center md:justify-between md:gap-5"
          >
            <div className="min-w-0 md:flex-1">
              <p className="text-caption font-bold tracking-caption-wide text-muted">
                上次练习{latest ? ` · ${formatDate(latest.submitted_at)}` : ""}
              </p>
              <h2 className="mt-1 truncate text-copy-lg font-bold text-ink">
                {latest?.title || "还没有练习记录"}
              </h2>
              <p className="mt-1 text-caption text-muted">
                {latest
                  ? `共 ${latest.total} 题 · 只记答对题数，不折算等级。`
                  : "选一种题型开始，不用一次做完整套。"}
              </p>
            </div>
            {latest ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <p className="text-copy text-muted">
                  <strong className="text-display-sm font-bold text-ink">{latest.correct}</strong>
                  <span className="mx-1 text-meta">/</span>
                  <span className="text-meta">{latest.total} 答对</span>
                </p>
                {wrongTotal > 0 ? (
                  <LinkButton href="/practice/exams/redo" size="sm">
                    回看 {wrongTotal} 道错题
                  </LinkButton>
                ) : null}
                <Link href={`/practice/exams/result/${latest.id}`} className={LINK_TEXT}>
                  回看结果 →
                </Link>
              </div>
            ) : wrongTotal > 0 ? (
              <LinkButton href="/practice/exams/redo" size="sm">
                回看 {wrongTotal} 道错题
              </LinkButton>
            ) : null}
          </section>

          <div className="user-page-layout has-aside">
            <div className="user-page-main">
              {/* 按题型练 */}
              <section aria-labelledby="practice-types-title">
                <div className="user-sec-head">
                  <h2 id="practice-types-title" className="user-sec-title">
                    按题型练
                  </h2>
                  <span className="user-sec-sub">每组只取一小段 · 不计时</span>
                </div>
                <ul className="divide-y divide-hairline">
                  {typeEntries.map((type, index) => (
                    <li key={type.key} className="flex items-start gap-3 py-6 sm:gap-4">
                      <span className="mt-1 w-5 flex-none font-mono text-caption text-muted">
                        0{index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-copy-lg font-bold text-ink">{type.title}</h3>
                          {type.tag && (
                            <span className="rounded-sm bg-brand-50 px-1.5 py-0.5 text-caption font-semibold text-brand-700">
                              {type.tag}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-copy leading-relaxed text-muted">
                          {type.description}
                        </p>
                        <p className="mt-2 text-caption text-muted">
                          {type.groupCount} 个完整题组 · {type.questionCount} 题
                        </p>
                      </div>
                      <div className="flex flex-none flex-col items-end gap-2">
                        <span className="hidden text-caption text-muted sm:inline">真题</span>
                        {type.groupCount > 0 ? (
                          <LinkButton
                            href={`/practice/daily?type=${type.key}`}
                            variant="outline"
                            size="sm"
                          >
                            开始
                          </LinkButton>
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            题库未接入
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 按套卷练 */}
              <section aria-labelledby="practice-papers-title">
                <div className="user-sec-head">
                  <h2 id="practice-papers-title" className="user-sec-title">
                    按套卷练
                  </h2>
                  <Link href="/practice/exams" className="user-sec-sub hover:text-ink">
                    全部套卷 →
                  </Link>
                </div>
                {papers.length ? (
                  <ul className="divide-y divide-hairline">
                    {papers.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-muted">
                            <span>
                              {p.year} 年 {p.month} 月
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{subjectLabel(p.level)}</span>
                            <span aria-hidden="true">·</span>
                            <span>第 {p.set_no} 套</span>
                          </p>
                          <h3 className="mt-1 text-copy-lg font-semibold text-ink">
                            阅读部分 · {p.total_questions} 题
                          </h3>
                          <p className="mt-1 text-caption text-muted">
                            选词填空 / 段落匹配 / 仔细阅读 · 建议用时约{" "}
                            {suggestedMinutesFor(p.total_questions)} 分钟
                          </p>
                        </div>
                        <div className="flex flex-none items-center gap-3">
                          <LinkButton href={`/practice/exams/${p.id}`} variant="outline" size="sm">
                            开始作答
                          </LinkButton>
                          <Link href="/practice/exams" className={LINK_TEXT}>
                            看构成
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-copy text-muted">
                    完整套卷已接入题库，去套卷列表挑一套开始。
                  </p>
                )}
                <p className="mt-4 border-t border-hairline pt-3 text-caption leading-relaxed text-muted">
                  按题型练都是节选；完整套卷在「套卷列表」里，交卷后自动判分并保留结果。
                </p>
              </section>
            </div>

            <aside className="user-page-aside" aria-label="练习信息">
              <section className="user-aside-sec">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="user-aside-title mb-0">最近练习</h2>
                  <span className="text-caption text-muted">只记答对题数</span>
                </div>
                {summary.recent.length ? (
                  <ul className="flex flex-col gap-3">
                    {summary.recent.map((s) => (
                      <li key={s.id}>
                        <Link href={`/practice/exams/result/${s.id}`} className="group block">
                          <p className="flex items-baseline justify-between gap-3 text-meta">
                            <span className="truncate text-body group-hover:text-ink">
                              {s.title}
                            </span>
                            <span className="flex-none font-mono text-caption text-muted">
                              {s.correct} / {s.total}
                            </span>
                          </p>
                          <p className="mt-0.5 text-caption text-muted">
                            {formatShortDate(s.submitted_at)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-copy text-muted">开始第一组后，结果会保存在这里。</p>
                )}
                <p className="mt-3 text-caption leading-relaxed text-muted">
                  只记答对题数，不折算等级。
                </p>
              </section>

              <details className="user-aside-sec">
                <summary className="cursor-pointer text-meta font-semibold text-body">
                  这一版包含
                </summary>
                <ul className="flex flex-col gap-2 text-meta text-body">
                  {typeEntries.map((t) => (
                    <li key={t.key} className="flex items-baseline justify-between gap-3">
                      <span>{t.title}</span>
                      <span className="font-mono text-caption text-muted">
                        {t.groupCount} 组 · {t.questionCount} 题
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-caption leading-relaxed text-muted">
                  听力、翻译、写作与完整套卷不在按题型练里；完整套卷见套卷列表。
                </p>
              </details>

              <details className="user-aside-sec">
                <summary className="cursor-pointer text-meta font-semibold text-body">
                  关于结果
                </summary>
                <p className="text-meta leading-relaxed text-body">
                  答对题数帮助你回顾本次表现，不代表考试预测分数。
                </p>
              </details>

              {wrongs.length > 0 && (
                <section className="user-aside-sec">
                  <h2 className="user-aside-title">错题回看</h2>
                  <ul className="flex flex-col gap-2">
                    {wrongs.slice(0, 2).map((w) => (
                      <li key={w.question_id}>
                        <Link
                          href={`/practice/exams/redo?ids=${w.question_id}`}
                          className="block text-meta text-body hover:text-ink"
                        >
                          <span className="line-clamp-2">{w.question || "回看原文章和题目"}</span>
                          <span className="mt-0.5 block text-caption text-muted">
                            {w.paper_title} · 错 {w.wrong_count} 次
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/practice/exams/redo"
                    className="mt-3 inline-block text-meta font-medium text-ink underline underline-offset-2"
                  >
                    重做全部错题 →
                  </Link>
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
