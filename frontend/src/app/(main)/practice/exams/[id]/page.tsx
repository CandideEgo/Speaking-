"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { subjectLabel } from "@/lib/examSubjects";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";
import { PageHeader } from "@/components/ui/PageHeader";
import ExamRunner, { ExamQuestionPublic, ExamSubmitResponse } from "@/components/exam/ExamRunner";

interface PaperDetail {
  id: string;
  level: string;
  year: number;
  month: number;
  set_no: number;
  title: string;
  total_questions: number;
  questions: ExamQuestionPublic[];
}

interface AttemptCreate {
  session_id: string;
  paper_id: string | null;
  mode: string;
  question_count: number;
  questions: ExamQuestionPublic[];
}

const SECTION_LABELS: Record<string, string> = {
  use_of_english: "完形填空",
  reading_A: "选词填空",
  reading_B: "段落匹配",
  reading_C: "仔细阅读",
  new_type: "新题型",
};

/** 建议用时：按真题阅读 30 题 / 40 分钟折算（与设计 exam.html 的口径一致）。 */
function suggestedMinutesFor(count: number): number {
  return Math.max(5, Math.round((count * 40) / 30));
}

export default function ExamPaperPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [attempt, setAttempt] = useState<AttemptCreate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<{ paperId: string; promise: Promise<AttemptCreate> } | null>(null);

  // 同一套试卷只创建一次 attempt（StrictMode/依赖变化导致 effect 重跑时复用同一请求）。
  const createAttempt = (paperId: string) => {
    if (attemptRef.current?.paperId === paperId) return attemptRef.current.promise;
    const promise = api<AttemptCreate>(`/api/v1/exams/${paperId}/attempts`, { method: "POST" });
    attemptRef.current = { paperId, promise };
    return promise;
  };

  useEffect(() => {
    if (!isAuthenticated || isLoading || !params.id) return;
    const paperId = params.id;
    let cancelled = false;
    (async () => {
      try {
        const detail = await api<PaperDetail>(`/api/v1/exams/${paperId}`);
        if (cancelled) return;
        setPaper(detail);
        const created = await createAttempt(paperId);
        if (!cancelled) setAttempt(created);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, isAuthenticated, isLoading]);

  const composition = useMemo(() => {
    if (!attempt) return [];
    const counts = new Map<string, number>();
    for (const q of attempt.questions) {
      counts.set(q.section, (counts.get(q.section) ?? 0) + 1);
    }
    return [...counts.entries()].map(([section, count]) => ({
      label: SECTION_LABELS[section] ?? section,
      count,
    }));
  }, [attempt]);

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  if (error || (!paper && !attempt)) {
    return (
      <div className="user-page">
        <p className="py-16 text-center text-copy text-muted">{error ?? "加载中…"}</p>
      </div>
    );
  }

  if (!attempt) return <FullPageSpinner />;

  // 级别标签必须走 subjectLabel：ky1/ky2 不能落到「四级」。
  const levelLabel = paper ? subjectLabel(paper.level) : "真题";
  const minutes = suggestedMinutesFor(attempt.questions.length);
  const title = paper
    ? `${paper.year} 年 ${paper.month} 月 · ${levelLabel}第 ${paper.set_no} 套 · 阅读部分`
    : "真题作答";

  return (
    <div className="user-page">
      <PageHeader
        crumb="套卷作答 · 阅读部分"
        title={title}
        description={
          <>
            {composition.map((c) => `${c.label} ${c.count} 题`).join(" · ")} · 共{" "}
            {attempt.questions.length} 题。建议用时约 {minutes} 分钟（按真题 30 题 / 40 分钟折算），
            <strong className="text-ink">只写建议、不倒数</strong>；写作、听力、翻译本轮未接入，只在
            阅读部分作答。
          </>
        }
        actions={
          <Link
            href="/practice/exams"
            className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-canvas px-4 py-2 text-copy font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-soft"
          >
            返回套卷列表
          </Link>
        }
      />

      <div className="mt-5">
        <ExamRunner
          questions={attempt.questions}
          submitPath={`/api/v1/exams/attempts/${attempt.session_id}/submit`}
          accent={`${paper?.year ?? ""} 年 ${paper?.month ?? ""} 月 ${levelLabel}真题`}
          suggestedMinutes={minutes}
          showZones
          onSubmitted={(result: ExamSubmitResponse) => {
            router.push(
              `/practice/exams/result/${result.session_id}?score=${result.score}&correct=${result.correct_count}&total=${result.total}`
            );
          }}
        />
      </div>
    </div>
  );
}
