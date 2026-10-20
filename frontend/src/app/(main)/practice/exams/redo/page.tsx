"use client";

import { useEffect, useRef, useState } from "react";
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
 *
 * 注意：本页保持「进入即开始」——e2e（exam.spec.ts）从结果页点「只练错题」后
 * 直接在 /practice/exams/redo 上等 `[data-testid=exam-option]`，加前置入口会破坏它。
 * 设计稿的「上次错题清单」信息改由成绩页的「每题对错与回看」承担（见 exam-result）。
 */
export default function WrongRedoPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [attempt, setAttempt] = useState<WrongRedoStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const startedRef = useRef(false);

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
    if (!isAuthenticated || isLoading || startedRef.current) return;
    startedRef.current = true;
    start();
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  if (!attempt) {
    return (
      <div className="pt-6 pb-18">
        <div className="flex flex-col items-center gap-5 py-16 text-center">
          <p className="text-copy text-muted">
            {loading ? "正在生成错题重做…" : (error ?? "错题重做不可用")}
          </p>
          {!loading && (
            <>
              <button
                onClick={start}
                className="inline-flex items-center gap-1.5 rounded-sm bg-ink px-4 py-2 text-copy font-semibold text-canvas transition-colors hover:bg-brand-500 hover:text-on-primary"
              >
                <RotateCcw size={14} />
                重新生成
              </button>
              <div className="flex items-center gap-4 text-copy">
                <Link
                  href="/practice/exams"
                  className="inline-flex items-center gap-1 text-muted transition-colors hover:text-ink"
                >
                  <ArrowLeft size={14} />
                  去套卷列表
                </Link>
                <Link
                  href="/practice"
                  className="inline-flex items-center gap-1 text-muted transition-colors hover:text-ink"
                >
                  返回练习专题
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-6 pb-18">
      <ExamRunner
        questions={attempt.questions}
        submitPath={`/api/v1/exams/attempts/${attempt.session_id}/submit`}
        accent="错题重做"
        suggestedMinutes={5}
        onSubmitted={(result: ExamSubmitResponse) => {
          router.push(`/practice/exams/result/${result.session_id}`);
        }}
        onQuit={() => router.push("/practice")}
      />
    </div>
  );
}
