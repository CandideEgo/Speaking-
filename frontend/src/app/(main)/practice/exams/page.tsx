"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, FileText, Trophy } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { subjectLabel, subjectOrder } from "@/lib/examSubjects";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { FullPageSpinner } from "@/components/common/Spinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

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

  return (
    <main className="min-h-full bg-surface-soft">
      <div className="py-8 pb-24">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/practice"
            className="inline-flex items-center gap-1 text-copy text-muted hover:text-ink transition-colors mb-3"
          >
            <ArrowLeft size={14} />
            返回练习
          </Link>
          <PageHeader
            className="pt-0 pb-0"
            crumb="真题试卷"
            title={
              <>
                {levelLabel}历年真题
                <span className="text-copy font-semibold text-muted ml-2">{total} 套</span>
              </>
            }
            description={
              <>
                历年{levelLabel}真题（{activeTab.sections}），交卷后自动判分。
              </>
            }
          />
        </div>

        {/* Level tabs */}
        <div className="inline-flex gap-1 rounded-lg bg-surface-card p-1 mb-6">
          {LEVEL_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setLevel(t.key)}
              className={`px-4 py-1.5 rounded-md text-copy font-semibold transition-colors ${
                level === t.key ? "bg-ink text-canvas" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Paper grid */}
        {loading ? (
          <div className="py-20 text-center text-copy text-muted">加载中…</div>
        ) : error ? (
          <ErrorState title={error} onRetry={() => setReloadKey((k) => k + 1)} className="py-10" />
        ) : papers.length === 0 ? (
          <EmptyState icon={FileText} title="暂无真题，敬请期待" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {papers.map((p) => (
              <Card
                as={Link}
                key={p.id}
                href={`/practice/exams/${p.id}`}
                padding={5}
                className="group flex flex-col gap-3 hover:border-brand-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-copy-lg font-bold text-ink group-hover:text-brand-600 transition-colors">
                      {p.year} 年{showsMonth ? ` ${p.month} 月` : ""}
                    </h2>
                    <p className="text-copy text-muted mt-0.5">
                      {showsMonth ? `第 ${p.set_no} 套 · ` : ""}
                      {p.total_questions} 题
                    </p>
                  </div>
                  <span className="text-caption font-semibold px-2 py-0.5 rounded-pill bg-surface-card text-muted flex-shrink-0">
                    {levelLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-meta text-muted">
                  {p.attempt_count > 0 ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-brand-600 font-semibold">
                        <Trophy size={12} />
                        最佳 {Math.round((p.best_score ?? 0) * 100)}%
                      </span>
                      <span>已考 {p.attempt_count} 次</span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                      未作答
                    </span>
                  )}
                </div>
                <span className="inline-flex items-center gap-1.5 text-copy font-semibold text-brand-600 group-hover:gap-2.5 transition-all">
                  开始作答
                  <ArrowLeft size={13} className="rotate-180" />
                </span>
              </Card>
            ))}
          </div>
        )}

        {/* 原卷 PDF —— 放在试卷网格下方：206 份的清单插在页签与试卷之间会把
            主要内容推到首屏之外。这块登录即可下载，无 Pro 门控。 */}
        {pdfGroups.length > 0 && (
          <section className="mt-14">
            <h2 className="text-copy-lg font-bold text-ink">试卷原件（PDF）</h2>
            <p className="text-copy text-muted mt-1 mb-5">
              历年原卷扫描件，共 {pdfs.length} 份，登录后可直接下载对照 —— 含专四、专八与考研英语，
              后两者本站暂无在线题库。
            </p>
            {pdfGroups.map((group) => (
              <div key={group.subject} className="mb-6">
                <h3 className="text-copy font-semibold text-ink mb-3">
                  {subjectLabel(group.subject)}
                  <span className="text-meta font-normal text-muted ml-2">
                    {group.items.length} 份
                  </span>
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((pdf) => (
                    <a
                      key={pdf.slug}
                      href={mediaUrl(`/api/v1/exam-pdfs/${pdf.slug}/file`, { withToken: true })}
                      download
                      className="inline-flex items-center gap-2 rounded-md border border-hairline bg-surface-card px-3 py-2 text-copy text-body hover:border-brand-400 hover:text-brand-600 transition-colors"
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
    </main>
  );
}
