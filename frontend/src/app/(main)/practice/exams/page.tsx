"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, mediaUrl } from "@/lib/api";
import { subjectLabel, PAPER_LEVELS } from "@/lib/examSubjects";
import { suggestedMinutesFor } from "@/lib/examPresentation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { ErrorState } from "@/components/common/ErrorState";
import { FullPageSpinner } from "@/components/common/Spinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";

interface PaperListItem {
  id: string;
  level: string;
  year: number;
  month: number;
  set_no: number;
  total_questions: number;
  last_session_id: string | null;
  last_correct_count: number | null;
  last_question_count: number | null;
  last_submitted_at: string | null;
}
interface PaperList {
  items: PaperListItem[];
  total: number;
  available_years: number[];
}
interface ExamPdfItem {
  slug: string;
  title: string;
  subject: string;
  year: number;
}

export default function ExamPapersPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const router = useRouter();
  const search = useSearchParams();
  const level = PAPER_LEVELS.includes(search.get("level") ?? "") ? search.get("level")! : "cet4";
  const year = /^\d{4}$/.test(search.get("year") ?? "") ? search.get("year")! : "";
  const status = ["submitted", "unsubmitted"].includes(search.get("status") ?? "")
    ? search.get("status")!
    : "all";
  const page = Math.max(1, Math.floor(Number(search.get("page")) || 1));
  const query = new URLSearchParams({ level, status, page: String(page), page_size: "12" });
  if (year) query.set("year", year);
  const queryKey = query.toString();
  const returnTo = `/practice/exams?${queryKey}`;
  const [data, setData] = useState<PaperList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfs, setPdfs] = useState<ExamPdfItem[] | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfRetry, setPdfRetry] = useState(0);
  const [pdfSubject, setPdfSubject] = useState("all");
  const [pdfYear, setPdfYear] = useState("");

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<PaperList>(`/api/v1/exams?${queryKey}`)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey, isAuthenticated, isLoading, retry]);
  useEffect(() => {
    if (!pdfOpen || !isAuthenticated) return;
    let cancelled = false;
    setPdfError(null);
    api<{ items: ExamPdfItem[] }>("/api/v1/exam-pdfs")
      .then((next) => {
        if (!cancelled) setPdfs(next.items);
      })
      .catch((e) => {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : "原卷加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [pdfOpen, isAuthenticated, pdfRetry]);

  function filter(patch: Record<string, string>, nextPage = 1) {
    const params = new URLSearchParams({ level, status, page: String(nextPage) });
    if (year) params.set("year", year);
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`/practice/exams?${params}`, { scroll: false });
  }
  if (isLoading || !isAuthenticated) return <FullPageSpinner />;
  const groups = new Map<string, PaperListItem[]>();
  for (const paper of data?.items ?? []) {
    const label = `${paper.year} 年${["cet4", "cet6"].includes(paper.level) ? ` ${paper.month} 月` : ""}`;
    groups.set(label, [...(groups.get(label) ?? []), paper]);
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 12));
  const subjectPdfs = (pdfs ?? []).filter((p) => pdfSubject === "all" || p.subject === pdfSubject);
  const pdfYears = [...new Set(subjectPdfs.map((p) => p.year))].sort((a, b) => b - a);
  const visiblePdfs = subjectPdfs.filter((p) => !pdfYear || String(p.year) === pdfYear);
  return (
    <div className="user-page">
      <Link href="/practice" className="text-copy text-muted hover:text-ink">
        返回练习
      </Link>
      <PageHeader
        className="mt-4"
        crumb="历年真题"
        title="历年真题 · 阅读部分"
        description="在线练习阅读客观题，交卷后核对答案。听力、写作、翻译暂未接入。"
      />
      <nav aria-label="真题科目" className="mt-5 flex gap-2 overflow-x-auto pb-2">
        {PAPER_LEVELS.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={key === level ? "primary" : "outline"}
            aria-pressed={key === level}
            onClick={() => filter({ level: key, year: "" })}
          >
            {subjectLabel(key)}
          </Button>
        ))}
      </nav>
      <div className="my-4 flex flex-wrap items-center gap-4">
        <label className="text-meta text-muted">
          年份{" "}
          <select
            aria-label="年份"
            value={year}
            onChange={(e) => filter({ year: e.target.value })}
            className="rounded-sm border border-hairline bg-canvas p-2 text-ink"
          >
            <option value="">全部</option>
            {(data?.available_years ?? []).map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
        </label>
        <label className="text-meta text-muted">
          状态{" "}
          <select
            aria-label="状态"
            value={status}
            onChange={(e) => filter({ status: e.target.value })}
            className="rounded-sm border border-hairline bg-canvas p-2 text-ink"
          >
            <option value="all">全部</option>
            <option value="unsubmitted">未完成</option>
            <option value="submitted">已完成</option>
          </select>
        </label>
        {!loading && !error && (
          <span className="text-meta text-muted">共 {data?.total ?? 0} 套</span>
        )}
      </div>
      {error ? (
        <ErrorState title="试卷加载失败" message={error} onRetry={() => setRetry((v) => v + 1)} />
      ) : loading ? (
        <p role="status" className="py-8 text-muted">
          正在读取试卷…
        </p>
      ) : (
        <>
          {data?.items.length ? (
            [...groups.entries()].map(([label, papers]) => (
              <section key={label} className="mt-6" aria-label={label}>
                <h2 className="border-b border-hairline pb-3 text-copy-lg font-semibold text-ink">
                  {label}
                </h2>
                <ul>
                  {papers.map((p) => {
                    const paperHref = `/practice/exams/${p.id}?return_to=${encodeURIComponent(returnTo)}`;
                    return (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline-soft py-4"
                      >
                        <div>
                          <h3 className="text-copy font-semibold text-ink">
                            {subjectLabel(p.level)} · 第 {p.set_no} 套
                          </h3>
                          <p className="mt-1 text-meta text-muted">
                            {p.total_questions} 题 · 建议约 {suggestedMinutesFor(p.total_questions)}{" "}
                            分钟
                            {p.last_session_id
                              ? ` · 已完成 · 上次答对 ${p.last_correct_count}/${p.last_question_count}`
                              : " · 未完成"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {p.last_session_id ? (
                            <>
                              <LinkButton
                                size="sm"
                                href={`/practice/exams/result/${p.last_session_id}?return_to=${encodeURIComponent(returnTo)}`}
                              >
                                看结果
                              </LinkButton>
                              <LinkButton size="sm" variant="outline" href={paperHref}>
                                重做
                              </LinkButton>
                            </>
                          ) : (
                            <LinkButton size="sm" href={paperHref}>
                              开始
                            </LinkButton>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          ) : (
            <p className="py-8 text-muted">没有符合筛选条件的试卷。</p>
          )}
          {pages > 1 && (
            <nav aria-label="试卷分页" className="mt-5 flex items-center justify-center gap-4">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => filter({}, page - 1)}
              >
                上一页
              </Button>
              <span className="text-meta text-muted">
                第 {page} / {pages} 页
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => filter({}, page + 1)}
              >
                下一页
              </Button>
            </nav>
          )}
        </>
      )}
      <details
        className="mt-10 border-t border-hairline pt-5"
        open={pdfOpen}
        onToggle={(e) => setPdfOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer text-copy-lg font-semibold text-ink">原卷 PDF</summary>
        <p className="mt-3 text-meta text-muted">
          专四、专八仅提供原卷 PDF。考研原卷按“考研英语”归类。
        </p>
        {pdfOpen && (
          <>
            <div className="my-4 flex flex-wrap gap-4">
              <label className="text-meta text-muted">
                PDF 科目{" "}
                <select
                  aria-label="PDF 科目"
                  value={pdfSubject}
                  onChange={(e) => {
                    setPdfSubject(e.target.value);
                    setPdfYear("");
                  }}
                  className="rounded-sm border border-hairline bg-canvas p-2 text-ink"
                >
                  <option value="all">全部</option>
                  {[...new Set((pdfs ?? []).map((p) => p.subject))].map((key) => (
                    <option key={key} value={key}>
                      {subjectLabel(key)}
                      {["tem4", "tem8"].includes(key) ? " · 仅原卷 PDF" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-meta text-muted">
                PDF 年份{" "}
                <select
                  aria-label="PDF 年份"
                  value={pdfYear}
                  onChange={(e) => setPdfYear(e.target.value)}
                  className="rounded-sm border border-hairline bg-canvas p-2 text-ink"
                >
                  <option value="">全部</option>
                  {pdfYears.map((y) => (
                    <option key={y} value={y}>
                      {y} 年
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {pdfError ? (
              <ErrorState
                title="原卷加载失败"
                message={pdfError}
                onRetry={() => setPdfRetry((v) => v + 1)}
              />
            ) : !pdfs ? (
              <p role="status" className="text-muted">
                正在读取原卷…
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {visiblePdfs.map((p) => (
                  <li key={p.slug} className="border-b border-hairline-soft py-3">
                    <a
                      className="text-copy text-brand-700 hover:underline"
                      href={mediaUrl(`/api/v1/exam-pdfs/${p.slug}/file`)}
                      download
                    >
                      {p.title}
                    </a>
                  </li>
                ))}
                {!visiblePdfs.length && <li className="text-muted">没有符合条件的原卷。</li>}
              </ul>
            )}
          </>
        )}
      </details>
    </div>
  );
}
