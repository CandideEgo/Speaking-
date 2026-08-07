"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/**
 * 真题客观题答题器 —— 试卷/每日小测共用。
 *
 * props:
 *  - questions: 不含答案的题目列表（GET /exams/{id} 或 /exams/daily/start 返回）
 *  - sessionId: 作答 session
 *  - submitPath: 提交端点路径（如 /exams/attempts/{sid}/submit）
 *  - onSubmitted: 交卷成功后回调（成绩页跳转 / 内联展示）
 *  - accent: 顶部徽标文案
 */
export interface ExamQuestionPublic {
  id: string;
  number: number;
  section: string;
  question_type: string;
  passage: string | null;
  question: string | null;
  options: Record<string, string> | null;
}

export interface ExamSubmitResultItem {
  question_id: string;
  number: number;
  section: string;
  question_type: string;
  question: string | null;
  options: Record<string, string> | null;
  passage: string | null;
  user_answer: string | null;
  correct: boolean | null;
  correct_answer: string | null;
  explanation: string | null;
}

export interface ExamSubmitResponse {
  session_id: string;
  mode: string;
  score: number;
  correct_count: number;
  total: number;
  part_scores: Record<string, { correct: number; total: number }>;
  results: ExamSubmitResultItem[];
}

const SECTION_LABELS: Record<string, string> = {
  reading_A: "Section A · 选词填空",
  reading_B: "Section B · 段落匹配",
  reading_C: "Section C · 仔细阅读",
};

export default function ExamRunner({
  questions,
  submitPath,
  onSubmitted,
  accent,
}: {
  questions: ExamQuestionPublic[];
  submitPath: string;
  onSubmitted: (result: ExamSubmitResponse) => void;
  accent: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(() => {
    const map: Record<string, ExamQuestionPublic[]> = {};
    for (const q of questions) {
      (map[q.section] ||= []).push(q);
    }
    return map;
  }, [questions]);

  const answered = Object.keys(answers).length;
  const pct = questions.length ? Math.round((answered / questions.length) * 100) : 0;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        answers: Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer })),
      };
      const result = await api<ExamSubmitResponse>(submitPath, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSubmitted(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败，请重试");
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <main className="min-h-full bg-surface-soft">
      {/* Sticky header: back / progress / submit */}
      <div className="sticky top-0 z-30 bg-canvas/92 backdrop-blur border-b border-hairline">
        <div className="max-w-[880px] mx-auto flex items-center gap-3.5 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-surface-card text-[13px] font-semibold text-ink flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            {accent}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-card overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-muted font-mono flex-shrink-0">
            {answered}/{questions.length}
          </span>
          <button
            onClick={() => setConfirming(true)}
            disabled={answered === 0 || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-ink text-canvas text-[13px] font-semibold hover:bg-brand-500 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            交卷
          </button>
        </div>
      </div>

      <div className="max-w-[880px] mx-auto px-4 py-8 pb-24 space-y-8">
        {error && (
          <div className="rounded-lg bg-error-50 text-error-600 text-[13px] px-4 py-3 border border-error-200">
            {error}
          </div>
        )}

        {Object.entries(sections).map(([section, qs]) => (
          <section key={section}>
            <h2 className="text-sm font-bold text-ink mb-3">
              {SECTION_LABELS[section] ?? section}
            </h2>
            <div className="space-y-5">
              {qs.map((q) => (
                <div key={q.id} className="bg-canvas border border-hairline rounded-xl p-5">
                  {q.passage ? (
                    <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap mb-4 text-muted">
                      {q.passage}
                    </p>
                  ) : null}
                  {q.question ? (
                    <p className="text-[14px] font-semibold leading-relaxed text-ink mb-3">
                      {q.number}. {q.question}
                    </p>
                  ) : (
                    <p className="text-[14px] font-semibold text-ink mb-3">第 {q.number} 题</p>
                  )}

                  {q.options ? (
                    <div className="grid gap-2">
                      {Object.entries(q.options).map(([key, text]) => {
                        const active = answers[q.id] === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: key }))}
                            className={`flex items-start gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors ${
                              active
                                ? "border-brand-500 bg-brand-50 text-ink"
                                : "border-hairline bg-surface-card text-ink hover:border-hairline-strong"
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${
                                active
                                  ? "border-brand-500 text-brand-600"
                                  : "border-hairline-strong text-muted"
                              }`}
                            >
                              {active ? <CheckCircle2 size={14} /> : key}
                            </span>
                            <span className="text-[13px] leading-relaxed">{text}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">（选项在文章/词库中，选择对应字母作答）</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Submit confirm modal */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => !submitting && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm bg-canvas rounded-2xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-ink mb-2">确认交卷？</h3>
            <p className="text-[13px] text-muted leading-relaxed mb-5">
              已作答 {answered}/{questions.length} 题
              {answered < questions.length ? "，未作答的题目将计为错误" : ""}。交卷后不可修改。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-md border border-hairline-strong text-[13px] font-semibold text-ink hover:bg-surface-card transition-colors"
              >
                再检查一下
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-md bg-brand-500 text-on-primary text-[13px] font-semibold hover:bg-brand-600 transition-colors disabled:opacity-60"
              >
                {submitting ? "提交中…" : "确认交卷"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
