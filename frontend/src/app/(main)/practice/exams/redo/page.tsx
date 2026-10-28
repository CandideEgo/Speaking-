"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { catalogReturnHref } from "@/lib/examPresentation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
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
 * 进入即创建重做会话；窄屏先读当前题组原文，再切到题目作答。
 * 错题清单与解析由结果页承担。
 */
export default function WrongRedoPage() {
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = catalogReturnHref(search.get("return_to"));
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [attempt, setAttempt] = useState<WrongRedoStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const startedRef = useRef(false);

  const start = () => {
    setError(null);
    setEmpty(false);
    setLoading(true);
    setAttempt(null);
    const params = new URLSearchParams(window.location.search);
    const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
    api<{ total: number }>("/api/v1/exams/wrong?page_size=1")
      .then(async (wrong) => {
        if (wrong.total === 0) {
          setEmpty(true);
          return;
        }
        const created = await api<WrongRedoStart>("/api/v1/exams/wrong/redo", {
          method: "POST",
          body: JSON.stringify({ question_ids: ids }),
        });
        setAttempt(created);
      })
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
      <div className="user-page">
        <PageHeader title="错题重做" variant="eyebrow" />
        <div className="flex flex-col items-center gap-5 py-16 text-center">
          <p className="text-copy text-muted">
            {loading
              ? "正在生成错题重做…"
              : empty
                ? "还没有错题，完成练习后会在这里保留答错的题目。"
                : (error ?? "错题重做不可用")}
          </p>
          {!loading && (
            <>
              {!empty && (
                <Button
                  variant="dark"
                  size="nav"
                  icon={RotateCcw}
                  onClick={start}
                  loading={loading}
                >
                  重新生成
                </Button>
              )}
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
    <div className="user-page">
      <PageHeader title="错题重做" className="sr-only" />
      <ExamRunner
        questions={attempt.questions}
        submitPath={`/api/v1/exams/attempts/${attempt.session_id}/submit`}
        accent="错题重做"
        suggestedMinutes={5}
        onSubmitted={(result: ExamSubmitResponse) => {
          router.push(
            `/practice/exams/result/${result.session_id}?return_to=${encodeURIComponent(returnTo)}`
          );
        }}
        onQuit={() => router.push(returnTo)}
      />
    </div>
  );
}
