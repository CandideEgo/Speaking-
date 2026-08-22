"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Timer, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

/**
 * 真题客观题答题器 —— 试卷/每日小测/错题重做共用。
 *
 * props:
 *  - questions: 不含答案的题目列表（GET /exams/{id} 或 /exams/daily/start 返回）
 *  - sessionId: 作答 session
 *  - submitPath: 提交端点路径（如 /exams/attempts/{sid}/submit）
 *  - onSubmitted: 交卷成功后回调（成绩页跳转 / 内联展示）
 *  - accent: 顶部徽标文案
 *  - durationSec: 倒计时时长（默认 30 分钟，原型 06 eh-timer）
 *  - onQuit: 退出按钮回调（默认 router.back()，原型 06 btn-quit）
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

const WORD_BANK_MARKER = "[word bank]";

interface DerivedOptions {
  /** bank = 选词填空词库；matching = 段落匹配段落字母。 */
  kind: "bank" | "matching";
  options: Record<string, string>;
}

/**
 * 选词填空 / 段落匹配题的 options 不落库（词库在 passage 末尾的
 * [word bank] 附录里；段落匹配的可选答案就是段落字母 A-O），
 * 前端从 passage 现场推导，否则这两节完全没有可点元素（「选项无法选择」根因）。
 */
function deriveOptions(q: ExamQuestionPublic): DerivedOptions | null {
  if (q.options || !q.passage) return null;
  const idx = q.passage.toLowerCase().indexOf(WORD_BANK_MARKER);
  if (idx !== -1) {
    // 词库条目形如 "A) accusations"，换行或空格分隔；剔除混入的 "1) xxx" 噪声。
    const raw = q.passage.slice(idx + WORD_BANK_MARKER.length);
    const marks = [...raw.matchAll(/([A-O])\)/g)];
    const options: Record<string, string> = {};
    for (let i = 0; i < marks.length; i++) {
      const start = (marks[i].index ?? 0) + marks[i][0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index : raw.length;
      const word = raw
        .slice(start, end)
        .split(/\s+\d+\)/)[0]
        .trim();
      if (word) options[marks[i][1]] = word;
    }
    return Object.keys(options).length ? { kind: "bank", options } : null;
  }
  if (q.question_type === "matching") {
    const letters = [...new Set([...q.passage.matchAll(/^([A-O])\)/gm)].map((m) => m[1]))];
    if (letters.length < 2) return null;
    return {
      kind: "matching",
      options: Object.fromEntries(letters.map((l) => [l, `段落 ${l}`])),
    };
  }
  return null;
}

/** 选词填空渲染正文时去掉末尾的词库附录（词库以选项形式单独展示）。 */
function stripWordBank(passage: string): string {
  const idx = passage.toLowerCase().indexOf(WORD_BANK_MARKER);
  return idx === -1 ? passage : passage.slice(0, idx).trim();
}

export default function ExamRunner({
  questions,
  submitPath,
  onSubmitted,
  accent,
  durationSec = 1800,
  onQuit,
}: {
  questions: ExamQuestionPublic[];
  submitPath: string;
  onSubmitted: (result: ExamSubmitResponse) => void;
  accent: string;
  /** 倒计时时长（秒），原型 06 eh-timer。 */
  durationSec?: number;
  /** 退出回调（原型 06 btn-quit）；缺省 router.back()。 */
  onQuit?: () => void;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(durationSec);
  const [submitted, setSubmitted] = useState(false);

  // 倒计时：提交后停止，到 0 仅告警不自动交卷（与原型 06 一致）。
  useEffect(() => {
    if (submitted) return;
    const id = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [submitted]);

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const timeWarn = timeLeft <= 60;

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
      setSubmitted(true);
      onSubmitted(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败，请重试");
      setSubmitting(false);
      setConfirming(false);
    }
  };

  const quit = () => {
    if (onQuit) onQuit();
    else router.back();
  };

  return (
    <div className="min-h-full bg-surface-soft">
      {/* Sticky header: quit / accent / timer / progress / submit */}
      <div className="sticky top-0 z-30 bg-canvas/92 backdrop-blur border-b border-hairline">
        <div className="max-w-[880px] mx-auto flex items-center gap-3.5 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={quit}
            disabled={submitting}
            aria-label="退出"
            title="退出"
            className="w-[34px] h-[34px] px-0 flex-shrink-0"
          />
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-surface-card text-[13px] font-semibold text-ink flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            {accent}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-card overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[13px] font-semibold font-mono flex-shrink-0 ${
              timeWarn ? "bg-warning-soft text-warning" : "bg-surface-card text-ink"
            }`}
          >
            <Timer size={13} />
            {mm}:{ss}
          </span>
          <span className="text-xs text-muted font-mono flex-shrink-0">
            {answered}/{questions.length}
          </span>
          <Button
            variant="dark"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={answered === 0 || submitting}
            className="hidden md:inline-flex flex-shrink-0"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            交卷
          </Button>
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
              {qs.map((q) => {
                const derived = deriveOptions(q);
                const options = q.options ?? derived?.options ?? null;
                return (
                  <div key={q.id} className="bg-canvas border border-hairline rounded-xl p-5">
                    {q.passage ? (
                      derived?.kind === "matching" ? (
                        <div className="max-h-72 overflow-y-auto custom-scrollbar rounded-lg border border-hairline-soft bg-surface-soft px-4 py-3 mb-4">
                          <p className="text-[13px] leading-relaxed text-muted whitespace-pre-wrap">
                            {q.passage}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap mb-4 text-muted">
                          {stripWordBank(q.passage)}
                        </p>
                      )
                    ) : null}
                    {q.question ? (
                      <p className="text-[14px] font-semibold leading-relaxed text-ink mb-3">
                        {q.number}. {q.question}
                      </p>
                    ) : (
                      <p className="text-[14px] font-semibold text-ink mb-3">第 {q.number} 题</p>
                    )}

                    {options ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {Object.entries(options).map(([key, text]) => {
                          const active = answers[q.id] === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              data-testid="exam-option"
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
                      <p className="text-xs text-muted">（本题暂无可选项）</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* 移动端底部提交栏（原型 06 exam-foot） */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-canvas/92 backdrop-blur border-t border-hairline px-4 py-3">
        <div className="max-w-[880px] mx-auto flex items-center gap-3">
          <span className="flex-1 text-xs text-muted">
            已答 <strong className="text-ink">{answered}</strong>/{questions.length}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={answered === 0 || submitting}
            className="flex-shrink-0"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            交卷
          </Button>
        </div>
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
              <Button
                variant="outline"
                fullWidth
                onClick={() => setConfirming(false)}
                disabled={submitting}
              >
                再检查一下
              </Button>
              <Button variant="primary" fullWidth onClick={submit} disabled={submitting}>
                {submitting ? "提交中…" : "确认交卷"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
