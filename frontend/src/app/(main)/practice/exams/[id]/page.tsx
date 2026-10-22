"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { paperIdentity, suggestedMinutesFor, catalogReturnHref } from "@/lib/examPresentation";
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

export default function ExamPaperPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = catalogReturnHref(searchParams.get("return_to"));
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

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  if (error || (!paper && !attempt)) {
    return (
      <div className="user-page">
        <p className="py-16 text-center text-copy text-muted">{error ?? "加载中…"}</p>
      </div>
    );
  }

  if (!attempt) return <FullPageSpinner />;

  const minutes = suggestedMinutesFor(attempt.questions.length);
  const title = paper ? `${paperIdentity(paper)} · 阅读部分` : "真题作答";

  return (
    <div className="user-page">
      <PageHeader className="sr-only" title={title} />
      <div>
        <ExamRunner
          questions={attempt.questions}
          submitPath={`/api/v1/exams/attempts/${attempt.session_id}/submit`}
          accent={title}
          suggestedMinutes={minutes}
          onQuit={() => router.push(returnTo)}
          onSubmitted={(result: ExamSubmitResponse) => {
            router.push(
              `/practice/exams/result/${result.session_id}?return_to=${encodeURIComponent(returnTo)}`
            );
          }}
        />
      </div>
    </div>
  );
}
