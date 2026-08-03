"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Check, X, RotateCcw, AlertCircle, Clock, ChevronLeft, Trophy } from "lucide-react";
import type { Paper, Question } from "@/data/practicePaper";

/** qid = `${partIndex}-${itemIndex}`. */
type Qid = string;

interface Answer {
  picked?: number; // choice
  text?: string; // fill / write / translate
  self?: "0" | "1"; // write / translate / speak self-eval
}

interface FlatQuestion extends Question {
  qid: Qid;
  part: string;
  partMeta: string;
}

interface PaperRunnerProps {
  paper: Paper;
  /** instant = 点选项立即判分（16 试卷专栏）；submit = 提交后统一判分（06 考试）。 */
  mode: "instant" | "submit";
  /** 考试层级标签（如 "四级"），用于结果页副标题。 */
  levelLabel?: string;
  /** submit 模式顶部栏的中间内容（层级选择器 / 标题 / 计时器），由页面注入。 */
  examHeaderExtra?: React.ReactNode;
  /** submit 模式提交时触发（页面可据此停止计时器等）。 */
  onSubmit?: () => void;
  /**
   * full = 独立页面（max-w-880 居中 + 大 padding，06/16 试卷专栏用）；
   * embedded = 嵌入 watch 页（裸 div，宽度/padding 由外层控制）。
   */
  variant?: "full" | "embedded";
}

/** Flatten the paper into a question list with stable qids. */
function flatten(paper: Paper): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  paper.forEach((p, pi) => {
    p.items.forEach((q) => {
      out.push({ ...q, qid: `${pi}-${out.length}`, part: p.part, partMeta: p.meta });
    });
  });
  return out;
}

/** Judge a single answer against its question. self-typed questions need self==="1". */
function isCorrect(q: Question, a: Answer | undefined): boolean {
  if (!a) return false;
  if (q.type === "choice") return a.picked === q.answer;
  if (q.type === "fill")
    return (a.text ?? "").trim().toLowerCase() === (q.fill ?? "").toLowerCase();
  if (q.self) return a.self === "1";
  return false;
}

// ---------------------------------------------------------------------------
// Single question renderer
// ---------------------------------------------------------------------------

function QuestionItem({
  q,
  index,
  answer,
  judged,
  onAnswer,
}: {
  q: FlatQuestion;
  index: number;
  answer: Answer | undefined;
  /** Whether to show correctness/answer (instant: answered; submit: submitted). */
  judged: boolean;
  onAnswer: (a: Answer) => void;
}) {
  const ok = judged ? isCorrect(q, answer) : false;
  const showExplain = judged && (q.type !== "write" && q.type !== "translate" ? true : true);

  return (
    <div
      className={cn(
        "rounded-xl border bg-canvas p-4 sm:p-[18px] mb-2.5 transition-colors",
        judged
          ? ok
            ? "border-success"
            : "border-error"
          : answer
            ? "border-brand-100"
            : "border-hairline"
      )}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className={cn(
            "w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold font-mono flex-shrink-0",
            answer ? "bg-brand-500 text-on-primary" : "bg-surface-card text-muted"
          )}
        >
          {index + 1}
        </span>
        <span className="text-[11px] font-semibold text-brand-600">{q.part}</span>
        <span className="ml-auto text-[11px] text-muted-soft">{q.pts} 分</span>
      </div>

      <div className="text-sm font-medium text-ink leading-relaxed mb-2">{q.stem}</div>
      {q.ctx && q.type !== "translate" && (
        <div className="text-[12.5px] text-muted italic mb-2.5 leading-relaxed">{q.ctx}</div>
      )}

      {/* choice */}
      {q.type === "choice" && q.choices && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.choices.map((c, i) => {
            const picked = answer?.picked === i;
            let cls = "border-hairline hover:bg-surface-card";
            if (judged) {
              if (i === q.answer) cls = "border-success bg-success-soft text-success font-semibold";
              else if (picked) cls = "border-error bg-red-soft text-error";
              else cls = "border-hairline opacity-70";
            } else if (picked) {
              cls = "border-brand-500 bg-brand-50 text-brand-600 font-semibold";
            }
            return (
              <button
                key={i}
                disabled={judged}
                onClick={() => onAnswer({ picked: i })}
                className={cn(
                  "relative text-left text-[13px] font-medium bg-canvas border-[1.5px] rounded-md px-3.5 py-2.5 transition-all",
                  cls,
                  judged && "cursor-default"
                )}
              >
                <span className="absolute top-1 right-2 text-[10px] font-mono text-muted-soft">
                  {i + 1}
                </span>
                {c}
              </button>
            );
          })}
        </div>
      )}

      {/* fill */}
      {q.type === "fill" && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="填入单词…"
            value={answer?.text ?? ""}
            disabled={judged}
            onChange={(e) => onAnswer({ text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !judged && (e.target as HTMLInputElement).value.trim()) {
                onAnswer({ text: (e.target as HTMLInputElement).value });
              }
            }}
            className={cn(
              "flex-1 h-[38px] px-3 text-sm border-[1.5px] rounded-md bg-canvas text-ink outline-none transition-colors",
              judged
                ? ok
                  ? "border-success bg-success-soft text-success"
                  : "border-error bg-red-soft text-error"
                : "border-hairline focus:border-brand-500"
            )}
          />
        </div>
      )}

      {/* translate context box */}
      {q.type === "translate" && q.ctx && (
        <div className="rounded-md bg-surface-soft p-2.5 text-[13px] text-body leading-relaxed mb-2">
          {q.ctx}
        </div>
      )}

      {/* write / translate textarea */}
      {(q.type === "write" || q.type === "translate") && (
        <textarea
          placeholder={q.type === "write" ? "在此作答…" : "在此输入译文…"}
          value={answer?.text ?? ""}
          disabled={judged}
          onChange={(e) => onAnswer({ text: e.target.value })}
          className="w-full min-h-[80px] p-2.5 text-[13px] border-[1.5px] border-hairline rounded-md bg-canvas text-ink outline-none resize-y leading-relaxed focus:border-brand-500"
        />
      )}

      {/* self-eval buttons (write / translate) */}
      {q.self && (
        <div className="flex gap-2 mt-2">
          {[
            { s: "0" as const, label: "需练习" },
            { s: "1" as const, label: q.type === "translate" ? "译对了" : "写对了" },
          ].map((b) => (
            <button
              key={b.s}
              disabled={judged}
              onClick={() => onAnswer({ ...answer, self: b.s })}
              className={cn(
                "px-4 py-2 rounded-md border-[1.5px] text-[13px] font-semibold transition-colors",
                answer?.self === b.s
                  ? "bg-brand-50 border-brand-500 text-brand-600"
                  : "border-hairline text-body bg-canvas hover:bg-surface-soft",
                judged && "opacity-70 cursor-default"
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* explanation */}
      {showExplain && judged && (
        <div
          className={cn(
            "mt-2.5 p-2.5 rounded-md text-[12.5px] leading-relaxed",
            ok ? "bg-success-soft text-success" : "bg-red-soft text-error"
          )}
        >
          <span className="font-bold">{ok ? "✓ 正确" : "✗ 错误"}</span>
          {" · "}正确答案：<span className="font-bold">{q.ans}</span>
          <span className="block mt-1">{q.explain}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result page (submit mode only)
// ---------------------------------------------------------------------------

function ResultPage({
  flat,
  answers,
  levelLabel,
  onRetryAll,
  onRetryWrong,
  onBack,
}: {
  flat: FlatQuestion[];
  answers: Record<Qid, Answer>;
  levelLabel?: string;
  onRetryAll: () => void;
  onRetryWrong: () => void;
  onBack: () => void;
}) {
  const wrongSet = useMemo(
    () => new Set(flat.filter((q) => !isCorrect(q, answers[q.qid])).map((q) => q.qid)),
    [flat, answers]
  );

  const { pct, gotPts, totalPts } = useMemo(() => {
    const total = flat.reduce((s, q) => s + q.pts, 0);
    const got = flat.reduce((s, q) => s + (isCorrect(q, answers[q.qid]) ? q.pts : 0), 0);
    return { pct: total ? Math.round((got / total) * 100) : 0, gotPts: got, totalPts: total };
  }, [flat, answers]);

  // Per-part scores
  const partScores = useMemo(() => {
    const parts: Record<string, { got: number; total: number }> = {};
    flat.forEach((q) => {
      if (!parts[q.part]) parts[q.part] = { got: 0, total: 0 };
      parts[q.part].total += q.pts;
      if (isCorrect(q, answers[q.qid])) parts[q.part].got += q.pts;
    });
    return parts;
  }, [flat, answers]);

  const emoji = pct >= 80 ? "🎉" : pct >= 60 ? "👍" : "💪";
  const title = pct >= 80 ? "表现出色！" : pct >= 60 ? "继续加油！" : "再练几遍！";

  return (
    <div className="max-w-[720px] mx-auto py-9 px-5 pb-20">
      <div className="text-center mb-7">
        <div className="text-[56px] mb-3">{emoji}</div>
        <div className="text-2xl font-extrabold tracking-tight mb-1.5">{title}</div>
        <div className="text-sm text-muted">
          {levelLabel ? `${levelLabel}水平检测 · ` : ""}共 {flat.length} 题
        </div>
        {/* Score ring (conic-gradient) */}
        <div
          className="inline-flex flex-col items-center justify-center w-[140px] h-[140px] rounded-full my-5 relative"
          style={{
            background: `conic-gradient(var(--brand-500) ${pct * 3.6}deg, var(--surface-card) ${pct * 3.6}deg)`,
          }}
        >
          <div className="absolute inset-2 rounded-full bg-canvas flex flex-col items-center justify-center">
            <span className="text-4xl font-extrabold font-mono text-ink">{pct}</span>
            <span className="text-[11px] text-muted mt-0.5">/ 100</span>
          </div>
        </div>
        <div className="text-xs text-muted">
          得分 <span className="font-semibold text-ink">{gotPts}</span> / {totalPts}
        </div>
      </div>

      {/* Per-part scores */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5 mb-6">
        {Object.entries(partScores).map(([k, v]) => {
          const p = v.total ? Math.round((v.got / v.total) * 100) : 0;
          return (
            <div key={k} className="rounded-xl border border-hairline bg-canvas p-3.5">
              <div className="text-xs text-muted mb-1.5">{k}</div>
              <div className="h-1.5 rounded-full bg-surface-card overflow-hidden mb-1.5">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${p}%` }} />
              </div>
              <div className="text-[13px] font-bold font-mono text-ink">
                {v.got}/{v.total}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2.5 justify-center flex-wrap mb-7">
        {wrongSet.size > 0 && (
          <button
            onClick={onRetryWrong}
            className="inline-flex items-center gap-1.5 px-7 py-3 rounded-xl text-sm font-semibold bg-canvas border border-hairline text-body hover:bg-surface-card transition-colors"
          >
            <AlertCircle size={15} />
            只练错题（{wrongSet.size}）
          </button>
        )}
        <button
          onClick={onRetryAll}
          className="inline-flex items-center gap-1.5 px-7 py-3 rounded-xl text-sm font-semibold bg-canvas border border-hairline text-body hover:bg-surface-card transition-colors"
        >
          <RotateCcw size={15} />
          再做一遍
        </button>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-7 py-3 rounded-xl text-sm font-semibold bg-brand-500 text-on-primary shadow-brand hover:bg-brand-600 transition-colors"
        >
          返回练习专题
        </button>
      </div>

      {/* Review */}
      <div className="text-sm font-bold mb-3">答题回顾</div>
      <div>
        {flat.map((q, idx) => (
          <QuestionItem
            key={q.qid}
            q={q}
            index={idx}
            answer={answers[q.qid]}
            judged
            onAnswer={() => {}}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export function PaperRunner({
  paper,
  mode,
  levelLabel,
  examHeaderExtra,
  onSubmit,
  variant = "full",
}: PaperRunnerProps) {
  const flat = useMemo(() => flatten(paper), [paper]);
  const [answers, setAnswers] = useState<Record<Qid, Answer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [wrongSet, setWrongSet] = useState<Set<Qid>>(new Set());

  const setAnswer = useCallback((qid: Qid, a: Answer) => {
    setAnswers((prev) => ({ ...prev, [qid]: a }));
  }, []);

  const visibleQuestions = useMemo(() => {
    if (mode === "submit" && onlyWrong) return flat.filter((q) => wrongSet.has(q.qid));
    return flat;
  }, [flat, mode, onlyWrong, wrongSet]);

  // instant mode: judge immediately on answer
  // submit mode: judge only after submitted
  const doneCount = visibleQuestions.filter((q) => answers[q.qid]).length;
  const rightCount = visibleQuestions.filter(
    (q) => answers[q.qid] && isCorrect(q, answers[q.qid])
  ).length;

  function handleSubmit() {
    const ws = new Set(flat.filter((q) => !isCorrect(q, answers[q.qid])).map((q) => q.qid));
    setWrongSet(ws);
    setSubmitted(true);
    setOnlyWrong(false);
    onSubmit?.();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function retry(wrongOnly: boolean) {
    setSubmitted(false);
    setOnlyWrong(wrongOnly);
    if (!wrongOnly) setAnswers({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ----- submit mode + submitted -> show result page -----
  if (mode === "submit" && submitted) {
    return (
      <ResultPage
        flat={flat}
        answers={answers}
        levelLabel={levelLabel}
        onRetryAll={() => retry(false)}
        onRetryWrong={() => retry(true)}
        onBack={() => {
          if (typeof window !== "undefined") window.history.back();
        }}
      />
    );
  }

  // ----- exam header (submit mode, answering phase) -----
  const examHeader =
    mode === "submit" ? (
      <div className="sticky top-16 z-30 bg-canvas/92 backdrop-blur border-b border-hairline px-5 py-3.5">
        <div className="max-w-[880px] mx-auto flex items-center gap-3.5">
          <button
            onClick={() => {
              if (typeof window !== "undefined") window.history.back();
            }}
            aria-label="退出"
            className="w-[34px] h-[34px] rounded-md text-muted flex items-center justify-center hover:text-ink hover:bg-surface-card transition-colors"
          >
            <X size={20} />
          </button>
          {examHeaderExtra}
          <span className="flex-1" />
          <button
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-brand-500 text-on-primary text-[13px] font-semibold shadow-brand hover:bg-brand-600 transition-colors"
          >
            <Check size={14} />
            提交试卷
          </button>
        </div>
      </div>
    ) : null;

  // ----- progress bar (instant mode) -----
  const instantProgress =
    mode === "instant" ? (
      <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-canvas border border-hairline rounded-xl shadow-soft">
        <span className="text-xs text-muted font-mono">
          {doneCount} / {visibleQuestions.length}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-surface-card overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${(doneCount / Math.max(visibleQuestions.length, 1)) * 100}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-success">
          对 {rightCount} · 错 {doneCount - rightCount}
        </span>
        <button
          onClick={() => setAnswers({})}
          className="text-xs text-muted hover:text-ink flex items-center gap-1 transition-colors"
          title="重置答题"
        >
          <RotateCcw size={13} />
          重置
        </button>
      </div>
    ) : null;

  return (
    <div>
      {examHeader}
      <div className={variant === "embedded" ? "" : "max-w-[880px] mx-auto px-5 py-6 pb-24"}>
        {instantProgress}

        {/* Part grouping */}
        {(() => {
          let lastPart = "";
          const nodes: React.ReactNode[] = [];
          visibleQuestions.forEach((q, idx) => {
            if (q.part !== lastPart) {
              lastPart = q.part;
              nodes.push(
                <div
                  key={`part-${q.part}`}
                  className="flex items-center gap-2.5 mt-7 mb-3.5 pb-2.5 border-b border-hairline"
                >
                  <span className="text-[11px] font-bold text-muted-soft font-mono tracking-wider">
                    PART
                  </span>
                  <span className="text-base font-bold text-ink">{q.part}</span>
                  <span className="ml-auto text-xs text-muted">{q.partMeta}</span>
                </div>
              );
            }
            const a = answers[q.qid];
            const judged = mode === "instant" ? !!a : submitted;
            nodes.push(
              <QuestionItem
                key={q.qid}
                q={q}
                index={idx}
                answer={a}
                judged={judged}
                onAnswer={(na) => setAnswer(q.qid, na)}
              />
            );
          });
          return nodes;
        })()}
      </div>
    </div>
  );
}

// Re-export icons used by pages for convenience.
export { Trophy, Clock, ChevronLeft };
