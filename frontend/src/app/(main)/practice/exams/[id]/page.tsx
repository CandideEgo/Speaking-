"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";
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

export default function ExamPaperPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [attempt, setAttempt] = useState<AttemptCreate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isLoading || !params.id) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await api<PaperDetail>(`/api/v1/exams/${params.id}`);
        if (cancelled) return;
        setPaper(detail);
        const created = await api<AttemptCreate>(`/api/v1/exams/${params.id}/attempts`, {
          method: "POST",
        });
        if (!cancelled) setAttempt(created);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  if (error || (!paper && !attempt)) {
    return (
      <main className="min-h-full bg-surface-soft">
        <div className="container-page py-16 text-center">
          <p className="text-sm text-muted">{error ?? "加载中…"}</p>
        </div>
      </main>
    );
  }

  if (!attempt) return <FullPageSpinner />;

  const levelLabel = paper?.level === "cet6" ? "六级" : "四级";

  return (
    <ExamRunner
      questions={attempt.questions}
      submitPath={`/api/v1/exams/attempts/${attempt.session_id}/submit`}
      accent={`${paper?.year ?? ""} 年 ${paper?.month ?? ""} 月 ${levelLabel}真题`}
      onSubmitted={(result: ExamSubmitResponse) => {
        router.push(
          `/practice/exams/result/${result.session_id}?score=${result.score}&correct=${result.correct_count}&total=${result.total}`
        );
      }}
    />
  );
}
