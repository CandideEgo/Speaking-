"use client";

import { useState } from "react";
import { ChevronDown, Loader2, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VocabDrillItem } from "@/types";

// ---------------------------------------------------------------------------
// SentenceBuilderInput — tap-to-order scrambled tokens.
// Used by the PracticeSection for sentence_building questions.
// ---------------------------------------------------------------------------

/**
 * A tap-to-reorder sentence builder. The learner taps tokens from the shuffled
 * pool to build the sentence; tapping a placed token returns it to the pool.
 * `value` is the space-joined chosen tokens in order; `onChange` reports it.
 */
export function SentenceBuilderInput({
  tokens,
  value,
  onChange,
}: {
  tokens: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const chosen = value ? value.split(" ") : [];

  // Pool indices already picked (tracked so duplicate tokens are distinguishable).
  const [usedPoolIndices, setUsedPoolIndices] = useState<Set<number>>(
    new Set(),
  );

  const pick = (indexInPool: number) => {
    if (usedPoolIndices.has(indexInPool)) return;
    const next = new Set(usedPoolIndices);
    next.add(indexInPool);
    setUsedPoolIndices(next);
    onChange([...chosen, tokens[indexInPool]].join(" "));
  };

  const unpick = (i: number) => {
    // Remove the i-th chosen token and release the corresponding pool index.
    const removed = chosen[i];
    const remaining = chosen.filter((_, idx) => idx !== i);
    onChange(remaining.join(" "));
    // Release one pool index whose token equals `removed` and is currently used.
    for (let p = 0; p < tokens.length; p++) {
      if (usedPoolIndices.has(p) && tokens[p] === removed) {
        const next = new Set(usedPoolIndices);
        next.delete(p);
        setUsedPoolIndices(next);
        break;
      }
    }
  };

  return (
    <div className="mt-1 space-y-2">
      {/* Chosen tokens */}
      <div className="min-h-[40px] flex flex-wrap gap-1.5 p-2 rounded-lg bg-surface-soft border border-hairline">
        {chosen.length === 0 ? (
          <span className="text-xs text-muted-soft">点击下方单词组成句子…</span>
        ) : (
          chosen.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => unpick(i)}
              className="px-2 py-1 rounded bg-canvas border border-ink text-[13px] hover:border-brand-500"
            >
              {t}
            </button>
          ))
        )}
      </div>
      {/* Shuffled token pool */}
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((t, p) => (
          <button
            key={p}
            type="button"
            disabled={usedPoolIndices.has(p)}
            onClick={() => pick(p)}
            className={cn(
              "px-2 py-1 rounded text-[13px] border transition-colors",
              usedPoolIndices.has(p)
                ? "border-hairline text-muted-soft bg-surface-soft cursor-default"
                : "border-hairline hover:border-ink hover:bg-surface-soft",
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VocabDrillPanel — free-tier vocabulary drill (spelling + meaning-choice).
// ---------------------------------------------------------------------------

/** Local copy of the useVocabDrill return shape (avoids importing the hook
 * type circularly). Kept in sync with useVocabDrill's UseVocabDrillReturn. */
interface VocabDrillLike {
  loading: boolean;
  error: string | null;
  items: VocabDrillItem[];
  answers: Record<number, string>;
  setAnswer: (index: number, answer: string) => void;
  graded: (VocabDrillItem & { userAnswer: string; correct: boolean })[];
  submitted: boolean;
  score: number | null;
  fetchDrill: () => Promise<void>;
  submit: () => void;
  reset: () => void;
}

export function VocabDrillPanel({
  open,
  onToggle,
  levelLabel,
  drill,
}: {
  open: boolean;
  onToggle: () => void;
  levelLabel: string;
  drill: VocabDrillLike;
}) {
  const {
    loading,
    items,
    answers,
    setAnswer,
    graded,
    submitted,
    score,
    submit,
    reset,
  } = drill;

  return (
    <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-soft transition-colors"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <GraduationCap size={16} className="text-brand-500" />
          视频词汇练习
          <span className="text-[11px] font-normal text-muted">
            · 拼写 + 释义选择 · {levelLabel}
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success-soft text-success">
            免费
          </span>
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-hairline">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" /> 加载词汇练习…
            </div>
          ) : items.length === 0 ? (
            <p className="py-4 text-sm text-muted">
              该视频暂无目标等级词汇可供练习。
            </p>
          ) : submitted && score !== null ? (
            <div className="text-center py-6">
              <div
                className={cn(
                  "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
                  score >= 60 ? "bg-success-soft" : "bg-brand-50",
                )}
              >
                <span
                  className={cn(
                    "text-xl font-bold",
                    score >= 60 ? "text-success" : "text-brand-500",
                  )}
                >
                  {score}%
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-ink">
                {score >= 60 ? "太棒了！" : "继续加油！"}
              </p>
              <button
                onClick={reset}
                className="btn-outline !py-1.5 !text-xs mt-3"
              >
                再做一次
              </button>
            </div>
          ) : (
            <>
              {items.map((it, i) => (
                <div key={i} className="mb-4 mt-3">
                  {it.kind === "spelling" ? (
                    <>
                      <p className="text-[14px] font-semibold mb-1 text-ink">
                        {i + 1}. 拼写
                      </p>
                      <p className="text-[13px] text-muted mb-2">
                        写出英文单词：{it.translation || "（无译文）"}
                      </p>
                      <input
                        type="text"
                        placeholder="输入英文单词..."
                        value={answers[i] || ""}
                        onChange={(e) => setAnswer(i, e.target.value)}
                        className="input-field mt-1"
                      />
                    </>
                  ) : (
                    <>
                      <p className="text-[14px] font-semibold mb-2 text-ink">
                        {i + 1}. 选择释义
                      </p>
                      <p className="text-[13px] text-ink mb-2">{it.word}</p>
                      <div>
                        {(it.options || []).map((opt, oi) => (
                          <label
                            key={oi}
                            className={cn(
                              "q-opt",
                              answers[i] === opt && "q-opt-selected",
                            )}
                            onClick={(e) => {
                              e.preventDefault();
                              setAnswer(i, opt);
                            }}
                          >
                            <input
                              type="radio"
                              name={`vd-${i}`}
                              value={opt}
                              checked={answers[i] === opt}
                              onChange={() => setAnswer(i, opt)}
                              className="sr-only"
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {submitted && graded[i] && (
                    <p
                      className={cn(
                        "text-xs mt-1.5",
                        graded[i].correct ? "text-success" : "text-red-500",
                      )}
                    >
                      {graded[i].correct ? "✓ 正确" : `✗ 答案：${it.answer}`}
                    </p>
                  )}
                </div>
              ))}
              <button
                onClick={submit}
                disabled={Object.keys(answers).length < items.length}
                className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                提交答案
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
