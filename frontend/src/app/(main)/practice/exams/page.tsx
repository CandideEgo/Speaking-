"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, FileText } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { subjectLabel, subjectOrder } from "@/lib/examSubjects";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { FullPageSpinner } from "@/components/common/Spinner";
import { PageHeader } from "@/components/ui/PageHeader";

interface PaperListItem {
  id: string;
  level: string;
  year: number;
  month: number;
  set_no: number;
  title: string;
  source: string | null;
  total_questions: number;
  last_score: number | null;
  last_submitted_at: string | null;
  attempt_count: number;
  best_score: number | null;
}

/** 一份原卷 PDF（`GET /api/v1/exam-pdfs`）。专四专八只有这个，没有题库。 */
interface ExamPdfItem {
  slug: string;
  title: string;
  subject: string;
  year: number;
  month: number | null;
  set_no: number;
  bytes: number;
}

/**
 * 试卷列表的科目页签。专四/专八没有题库数据，所以不在这里 —— 它们只出现在
 * 页面底部的「试卷原件（PDF）」区块里。
 */
const LEVEL_TABS = [
  { key: "cet4", sections: "选词填空 / 段落匹配 / 仔细阅读" },
  { key: "cet6", sections: "选词填空 / 段落匹配 / 仔细阅读" },
  { key: "ky1", sections: "完形填空 / 阅读理解 Part A / 新题型 Part B" },
  { key: "ky2", sections: "完形填空 / 阅读理解 Part A / 新题型 Part B" },
].map((t) => ({ ...t, label: subjectLabel(t.key) }));

// CET 的卷有真实月份（一年两考），考研卷源里没有月份 —— 导入时统一填了 12，
// 拿出来当「12 月」展示是编的。所以按科目决定要不要显示月份。
const MONTHED_LEVELS = new Set(["cet4", "cet6"]);

/** 建议用时：按真题阅读 30 题 / 40 分钟折算（与设计 exams.html/exam.html 同口径）。 */
function suggestedMinutesFor(count: number): number {
  return Math.max(4, Math.round((count * 40) / 30));
}

/** 「已完成」状态用答对题数，不做百分制换算。 */
function completedCorrect(p: PaperListItem): number {
  return Math.max(
    0,
    Math.min(p.total_questions, Math.round((p.last_score ?? 0) * p.total_questions))
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function groupPdfsBySubject(items: ExamPdfItem[]) {
  const bySubject = new Map<string, ExamPdfItem[]>();
  for (const item of items) {
    const group = bySubject.get(item.subject);
    if (group) group.push(item);
    else bySubject.set(item.subject, [item]);
  }
  return [...bySubject.entries()]
    .sort((a, b) => subjectOrder(a[0]) - subjectOrder(b[0]))
    .map(([subject, group]) => ({ subject, items: group }));
}

const LINK_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-sm bg-brand-500 px-4 py-2 text-copy font-semibold text-on-primary transition-colors hover:bg-brand-600";
const LINK_OUTLINE =
  "inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-canvas px-3 py-1.5 text-meta font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-soft";

/**
 * 真题套卷列表（stage-3 保真版）。
 *
 * 信息层级按设计 exams.html：年份/月份 + 第 N 套 + 级别 + 题量 + 构成 +
 * 建议用时 + 完成状态 + 开始作答；完成状态只记答对题数（不换算百分制）。
 * 页头给一个橙色主操作「开始最近一套」；375 的级别页签改为横向滚动，不再逐字折行。
 */
export default function ExamPapersPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [level, setLevel] = useState<string>("cet4");
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pdfs, setPdfs] = useState<ExamPdfItem[]>([]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<{ items: PaperListItem[]; total: number }>(
      `/api/v1/exams?level=${level}&page=1&page_size=50`
    )
      .then((data) => {
        if (cancelled) return;
        setPapers(data.items);
        setTotal(data.total);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPapers([]);
        setTotal(0);
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [level, isAuthenticated, isLoading, reloadKey]);

  // 原卷 PDF 清单与页签无关（一次拉全），失败就当没有这一块 —— 它是附加资源，
  // 不该因为一个次要请求失败而把整页打成错误态。
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    let cancelled = false;
    api<{ count: number; items: ExamPdfItem[] }>("/api/v1/exam-pdfs")
      .then((data) => !cancelled && setPdfs(data.items))
      .catch(() => !cancelled && setPdfs([]));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  const activeTab = LEVEL_TABS.find((t) => t.key === level) ?? LEVEL_TABS[0];
  const levelLabel = activeTab.label;
  const showsMonth = MONTHED_LEVELS.has(level);
  const pdfGroups = groupPdfsBySubject(pdfs);
  const firstPaper = papers[0];

  return (
    <div className="pt-6 pb-18">
      <Link
        href="/practice"
        className="inline-flex items-center gap-1 text-copy text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} />
        返回练习
      </Link>

      <PageHeader
        className="mt-4"
        crumb="真题套卷"
        title={
          <>
            {levelLabel}历年真题{" "}
            <span className="text-copy font-semibold text-muted">{total} 套</span>
          </>
        }
        description={
          <>
            历年 {levelLabel} 真题（{activeTab.sections}
            ），交卷后自动判分。列表只显示题量、建议用时与完成状态；
            只记答对题数，不预测考试分数、不折算等级。
          </>
        }
        actions={
          firstPaper ? (
            <Link href={`/practice/exams/${firstPaper.id}`} className={LINK_PRIMARY}>
              开始最近一套
            </Link>
          ) : undefined
        }
      />

      {/* 级别页签：横向滚动，避免 375 下被压成逐字折行 */}
      <div className="custom-scrollbar -mx-1 mt-5 overflow-x-auto px-1 pb-1">
        <div
          className="inline-flex min-w-max items-center gap-1 rounded-pill border border-hairline bg-surface-soft p-1"
          role="tablist"
          aria-label="选择级别"
        >
          {LEVEL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={level === t.key}
              onClick={() => setLevel(t.key)}
              className={`inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-pill px-3.5 text-meta font-medium transition-colors ${
                level === t.key ? "bg-ink text-canvas" : "text-muted hover:bg-canvas hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="py-16 text-center text-copy text-muted">加载中…</p>
        ) : error ? (
          <ErrorState title={error} onRetry={() => setReloadKey((k) => k + 1)} className="py-10" />
        ) : papers.length === 0 ? (
          <EmptyState icon={FileText} title="暂无符合条件的试卷" />
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {papers.map((p) => {
              const done = p.attempt_count > 0 && p.last_score != null;
              const minutes = suggestedMinutesFor(p.total_questions);
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-muted">
                      <span>
                        {p.year} 年{showsMonth ? ` ${p.month} 月` : ""}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>第 {p.set_no} 套</span>
                      <span className="rounded-sm bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-700">
                        {levelLabel}
                      </span>
                      <span
                        className={`rounded-sm border px-1.5 py-0.5 font-medium ${
                          done ? "border-hairline-strong text-ink" : "border-hairline text-muted"
                        }`}
                      >
                        {done ? "已完成" : "未作答"}
                      </span>
                    </p>
                    <h3 className="mt-1.5 text-copy-lg font-semibold text-ink">
                      阅读部分 · {p.total_questions} 题
                    </h3>
                    <p className="mt-1 text-meta text-muted">
                      {activeTab.sections} · 建议用时约 {minutes} 分钟（按真题 30 题 / 40 分钟折算）
                    </p>
                    <p className="mt-1.5 text-meta text-body">
                      {done ? (
                        <>
                          上次成绩{" "}
                          <strong className="font-semibold text-ink">
                            {completedCorrect(p)} / {p.total_questions}
                          </strong>
                          {p.last_submitted_at ? `，${formatDate(p.last_submitted_at)}` : ""}
                          {p.attempt_count > 1 ? ` · 已考 ${p.attempt_count} 次` : ""}
                          。只记答对题数，不折算等级。
                        </>
                      ) : (
                        "还没有作答记录；交卷后自动判分并保留结果。"
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    <Link href={`/practice/exams/${p.id}`} className={LINK_OUTLINE}>
                      开始作答
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 原卷 PDF —— 放在试卷列表下方：206 份的清单插在页签与试卷之间会把
          主要内容推到首屏之外。这块登录即可下载，无 Pro 门控。 */}
      {pdfGroups.length > 0 && (
        <section className="mt-12">
          <div className="user-sec-head">
            <h2 className="user-sec-title">试卷原件（PDF）</h2>
            <span className="user-sec-sub">共 {pdfs.length} 份</span>
          </div>
          <p className="mt-2 text-copy text-muted">
            历年原卷扫描件，登录后可直接下载对照 —— 含专四、专八与考研英语，
            后两者本站暂无在线题库。
          </p>
          {pdfGroups.map((group) => (
            <div key={group.subject} className="mt-5">
              <h3 className="mb-3 text-copy font-semibold text-ink">
                {subjectLabel(group.subject)}
                <span className="ml-2 text-meta font-normal text-muted">
                  {group.items.length} 份
                </span>
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((pdf) => (
                  <a
                    key={pdf.slug}
                    href={mediaUrl(`/api/v1/exam-pdfs/${pdf.slug}/file`, { withToken: true })}
                    download
                    className="inline-flex items-center gap-2 rounded-sm border border-hairline bg-canvas px-3 py-2 text-meta text-body transition-colors hover:border-ink hover:text-ink"
                  >
                    <FileDown size={14} className="flex-shrink-0" />
                    <span className="truncate">{pdf.title}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
