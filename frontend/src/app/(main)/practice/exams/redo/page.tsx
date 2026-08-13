"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";
import ExamRunner, { ExamQuestionPublic, ExamSubmitResponse } from "@/components/exam/ExamRunner";

interface WrongRedoStart {
  session_id: string;
  paper_id: string | null;
  mode: string;
  question_count: number;
  questions: ExamQuestionPublic[];
}

/**
 * 错题重做（原型 08 wrong-block「重做全部错题」+ 结果页「只练错题」的落地页）。
 * 启动后 POST /exams/wrong/redo（缺省重做全部错题；结果页通过 ?ids= 传入子集），
 * 用 ExamRunner 作答，交卷后复用统一成绩页。
 */
export default function WrongRedoPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [attempt, setAttempt] = useState<WrongRedoStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const start = () => {
    setError(null);
    setLoading(true);
    setAttempt(null);
    const params = new URLSearchParams(window.location.search);
    const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
    api<WrongRedoStart>("/api/v1/exams/wrong/redo", {
      method: "POST",
      body: JSON.stringify({ question_ids: ids }),
    })
      .then(setAttempt)
      .catch((e) => setError(e instanceof Error ? e.message : "生成重做失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAuthenticated && !isLoading) start();
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  if (!attempt) {
    return (
      <main className="min-h-full bg-surface-soft">
        <div className="container-page py-16 text-center space-y-5">
          <p className="text-sm text-muted">
            {loading ? "正在生成错题重做…" : (error ?? "错题重做不可用")}
          </p>
          {!loading && (
            <>
              <button
                onClick={start}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-ink text-canvas text-[13px] font-semibold hover:bg-brand-500 transition-colors"
              >
                <RotateCcw size={14} />
                重新生成
              </button>
              <div>
                <Link
                  href="/practice"
                  className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink transition-colors"
                >
                  <ArrowLeft size={14} />
                  返回练习专题
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <ExamRunner
      questions={attempt.questions}
      submitPath={`/api/v1/exams/attempts/${attempt.session_id}/submit`}
      accent="错题重做"
      onSubmitted={(result: ExamSubmitResponse) => {
        router.push(`/practice/exams/result/${result.session_id}`);
      }}
      onQuit={() => router.push("/practice")}
    />
  );
}
