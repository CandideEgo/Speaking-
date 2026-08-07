"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";

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

const LEVEL_TABS = [
  { key: "cet4", label: "四级" },
  { key: "cet6", label: "六级" },
];

export default function ExamPapersPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [level, setLevel] = useState<string>("cet4");
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    let cancelled = false;
    setLoading(true);
    api<{ items: PaperListItem[]; total: number }>(
      `/api/v1/exams?level=${level}&page=1&page_size=50`
    )
      .then((data) => {
        if (cancelled) return;
        setPapers(data.items);
        setTotal(data.total);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [level, isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  const levelLabel = LEVEL_TABS.find((t) => t.key === level)?.label ?? level;

  return (
    <main className="min-h-full bg-surface-soft">
      <div className="container-page py-8 pb-24">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/practice"
            className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink transition-colors mb-3"
          >
            <ArrowLeft size={14} />
            返回练习
          </Link>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-brand-50 text-brand-600 text-[13px] font-semibold">
            <FileText size={13} />
            真题试卷
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-3 mb-1">
            {levelLabel}历年真题
            <span className="text-sm font-semibold text-muted ml-2">{total} 套</span>
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            2017-2025 年大学英语{levelLabel}考试阅读部分原题（选词填空 /
            段落匹配），交卷后自动判分。
          </p>
        </div>

        {/* Level tabs */}
        <div className="inline-flex gap-1 rounded-lg bg-surface-card p-1 mb-6">
          {LEVEL_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setLevel(t.key)}
              className={`px-4 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${
                level === t.key ? "bg-ink text-canvas" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Paper grid */}
        {loading ? (
          <div className="py-20 text-center text-sm text-muted">加载中…</div>
        ) : papers.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted">暂无真题，敬请期待</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {papers.map((p) => (
              <Link
                key={p.id}
                href={`/practice/exams/${p.id}`}
                className="group flex flex-col gap-3 bg-canvas border border-hairline rounded-xl p-5 hover:border-brand-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-ink group-hover:text-brand-600 transition-colors">
                      {p.year} 年 {p.month} 月
                    </h2>
                    <p className="text-[13px] text-muted mt-0.5">
                      第 {p.set_no} 套 · {p.total_questions} 题
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-pill bg-surface-card text-muted flex-shrink-0">
                    {levelLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
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
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 group-hover:gap-2.5 transition-all">
                  开始作答
                  <ArrowLeft size={13} className="rotate-180" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
