"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";
import ExamRunner, { ExamQuestionPublic, ExamSubmitResponse } from "@/components/exam/ExamRunner";

interface DailyStart {
  session_id: string;
  paper_id: string | null;
  mode: string;
  question_count: number;
  questions: ExamQuestionPublic[];
}

export default function DailyCheckPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [attempt, setAttempt] = useState<DailyStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const start = () => {
    setError(null);
    setLoading(true);
    setAttempt(null);
    api<DailyStart>("/api/v1/exams/daily/start?count=10")
      .then(setAttempt)
      .catch((e) => setError(e instanceof Error ? e.message : "生成小测失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAuthenticated && !isLoading) start();
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  if (loading && !attempt) {
    return (
      <main className="min-h-full bg-surface-soft">
        <div className="container-page py-16 text-center">
          <p className="text-sm text-muted">正在从真题题库抽题…</p>
        </div>
      </main>
    );
  }

  if (!attempt) {
    return (
      <main className="min-h-full bg-surface-soft">
        <div className="container-page py-16 text-center space-y-4">
          <p className="text-sm text-muted">{error ?? "小测不可用"}</p>
          <button
            onClick={start}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-ink text-canvas text-[13px] font-semibold hover:bg-brand-500 transition-colors"
          >
            <RotateCcw size={14} />
            重新生成
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="bg-surface-soft">
        <div className="container-page py-6 pb-2 max-w-[880px]">
          <Link
            href="/practice"
            className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink transition-colors"
          >
            <ArrowLeft size={14} />
            返回练习
          </Link>
          <div className="flex items-center gap-2.5 mt-3 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-brand-50 text-brand-600 text-[13px] font-semibold">
              <Clock size={13} />
              每日小测
            </span>
            <span className="text-xs text-muted">从四六级真题随机抽 10 题 · 完成后可查看解析</span>
          </div>
        </div>
      </div>
      <ExamRunner
        questions={attempt.questions}
        submitPath={`/api/v1/exams/attempts/${attempt.session_id}/submit`}
        accent="每日小测"
        onSubmitted={(result: ExamSubmitResponse) => {
          router.push(`/practice/exams/result/${result.session_id}`);
        }}
      />
    </>
  );
}
