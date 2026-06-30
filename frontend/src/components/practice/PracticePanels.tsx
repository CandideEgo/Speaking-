"use client";

import { useState, type ReactNode } from "react";
import { Loader2, RotateCcw, Lock, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { LinkButton } from "@/components/ui/LinkButton";
import type {
  PracticeQuestion,
  VocabDrillItem,
  QuizQuestion,
  GradedResult,
} from "@/types";

// ---------------------------------------------------------------------------
// SentenceBuilderInput — tap-to-order scrambled tokens.
// Used by the practice "sentence_building" question type.
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
  disabled,
}: {
  tokens: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const chosen = value ? value.split(" ") : [];

  // Pool indices already picked (tracked so duplicate tokens are distinguishable).
  const [usedPoolIndices, setUsedPoolIndices] = useState<Set<number>>(
    new Set(),
  );

  const pick = (indexInPool: number) => {
    if (disabled || usedPoolIndices.has(indexInPool)) return;
    const next = new Set(usedPoolIndices);
    next.add(indexInPool);
    setUsedPoolIndices(next);
    onChange([...chosen, tokens[indexInPool]].join(" "));
  };

  const unpick = (i: number) => {
    if (disabled) return;
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
              disabled={disabled}
              className="px-2 py-1 rounded bg-canvas border border-ink text-[13px] hover:border-brand-500 disabled:opacity-60"
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
            disabled={disabled || usedPoolIndices.has(p)}
            onClick={() => pick(p)}
            className={cn(
              "px-2 py-1 rounded text-[13px] border transition-colors",
              usedPoolIndices.has(p)
                ? "border-hairline text-muted-soft bg-surface-soft cursor-default"
                : "border-hairline hover:border-ink hover:bg-surface-soft",
              disabled && "opacity-60",
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
// Shared presentational pieces
// ---------------------------------------------------------------------------

/** Common shape implemented by usePracticeMode / useVocabDrill / useQuiz. */
interface SessionLike<I> {
  loading: boolean;
  error: string | null;
  items: I[];
  answers: Record<number, string>;
  graded: Record<number, GradedResult>;
  grading: Record<number, boolean>;
  answeredCount: number;
  correctCount: number;
  score: number | null;
  accuracy: number | null;
  setAnswer: (index: number, answer: string) => void;
  gradeAnswer: (index: number, answer?: string) => void;
  reset: () => void;
  refetch: () => Promise<void>;
}

/** One question with its input widget and an inline graded reveal. */
function QuestionCard({
  prompt,
  hint,
  passage,
  graded,
  grading,
  children,
}: {
  prompt: ReactNode;
  hint?: ReactNode;
  passage?: string | null;
  graded?: GradedResult | null;
  grading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 mt-3">
      <p className="text-[14px] font-semibold mb-1 text-ink">{prompt}</p>
      {hint ? <p className="text-[13px] text-muted mb-2">{hint}</p> : null}
      {passage ? (
        <p className="text-[13px] text-body leading-relaxed bg-surface-soft rounded-lg p-3 mb-2">
          {passage}
        </p>
      ) : null}
      {children}
      {grading ? (
        <p className="text-xs mt-1.5 text-muted flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> 判分中…
        </p>
      ) : graded ? (
        <div
          className={cn(
            "mt-1.5 text-xs rounded-md px-2 py-1.5",
            graded.correct
              ? "bg-success-soft text-success"
              : "bg-red-50 text-red-600",
          )}
        >
          <p className="font-medium">
            {graded.correct
              ? "✓ 正确"
              : `✗ 正确答案：${graded.correctAnswer ?? ""}`}
          </p>
          {graded.explanation ? (
            <p className="mt-0.5 opacity-90 leading-relaxed">
              {graded.explanation}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Radio option list. On select -> `onSelect`. When graded, the correct option
 * turns green and a wrong pick turns red; interaction is locked. */
function OptionList({
  name,
  options,
  selected,
  graded,
  locked,
  onSelect,
}: {
  name: string;
  options: string[];
  selected?: string;
  graded?: GradedResult | null;
  locked: boolean;
  onSelect: (opt: string) => void;
}) {
  return (
    <div>
      {options.map((opt, oi) => {
        const isSelected = selected === opt;
        const isCorrectAnswer = !!graded && opt === graded.correctAnswer;
        const isWrongPick = !!graded && isSelected && !graded.correct;
        return (
          <label
            key={oi}
            className={cn(
              "q-opt",
              !graded && isSelected && "q-opt-selected",
              isCorrectAnswer && "border-success bg-success-soft text-success",
              isWrongPick && "border-red-500 bg-red-50 text-red-600",
              locked && "cursor-default",
            )}
            // preventDefault 阻止 label 默认把焦点转给内部 sr-only radio ——
            // 否则浏览器会对该 absolute 1px 元素做隐式 focus 滚动，把整页
            // <main> 的 scrollTop 跳走，导致点击选项后整页下半部白屏。
            // onChange 仍会触发，checked 由 state 控制，不受影响。
            onClick={(e) => {
              e.preventDefault();
              if (!locked) onSelect(opt);
            }}
          >
            <input
              type="radio"
              name={name}
              value={opt}
              checked={isSelected}
              onChange={() => onSelect(opt)}
              disabled={locked}
              className="sr-only"
            />
            {opt}
          </label>
        );
      })}
    </div>
  );
}

/** "检查答案" button for text-type questions (spelling / fill_blank / dictation
 * / qa textarea / sentence_building). Triggers per-question grading. */
function CheckButton({
  onClick,
  disabled,
  grading,
}: {
  onClick: () => void;
  disabled?: boolean;
  grading?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="mt-2"
    >
      {grading ? (
        <span className="flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> 判分中
        </span>
      ) : (
        "检查答案"
      )}
    </Button>
  );
}

function ProUpsell({ levelLabel }: { levelLabel: string }) {
  return (
    <div className="py-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Lock size={20} />
      </div>
      <p className="text-sm font-medium text-ink">AI 练习模式为 Pro 专属</p>
      <p className="mt-1 text-xs text-muted">
        基于本视频字幕 AI 生成 {levelLabel} 练习题，逐题判分与解析。
      </p>
      <LinkButton href="/pricing" variant="primary" size="sm" className="mt-3">
        升级 Pro
      </LinkButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UnifiedPracticePanel — single panel hosting tabs for the three practice
// modes. Merges the old VocabDrillPanel + inline PracticeSection + inline Quiz.
// ---------------------------------------------------------------------------

type Tab = "vocab" | "practice" | "quiz";

export function UnifiedPracticePanel({
  vocab,
  practice,
  quiz,
  isPro,
  levelLabel,
}: {
  vocab: SessionLike<VocabDrillItem>;
  practice: SessionLike<PracticeQuestion>;
  quiz: SessionLike<QuizQuestion> & {
    allGraded: boolean;
    recordScore: () => Promise<void>;
  };
  isPro: boolean;
  levelLabel: string;
}) {
  const [tab, setTab] = useState<Tab>("vocab");
  const hasQuiz = quiz.items.length > 0;

  const active: SessionLike<unknown> =
    tab === "vocab" ? vocab : tab === "practice" ? practice : quiz;

  const allAnswered =
    active.items.length > 0 && active.answeredCount === active.items.length;

  const tabs: { key: Tab; label: string; badge?: ReactNode; show: boolean }[] =
    [
      { key: "vocab", label: "词汇练习", show: true },
      {
        key: "practice",
        label: "AI 练习",
        show: true,
        badge: !isPro ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            Pro
          </span>
        ) : undefined,
      },
      { key: "quiz", label: "理解测验", show: hasQuiz },
    ];

  return (
    <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <GraduationCap size={16} className="text-brand-500" />
          练习
          <span className="text-[11px] font-normal text-muted">
            · {levelLabel}
          </span>
        </span>
        <div className="flex items-center gap-3">
          {active.items.length > 0 && (
            <span className="text-[11px] text-muted">
              已答 {active.answeredCount}/{active.items.length} · 正确{" "}
              {active.correctCount}
              {allAnswered && active.score !== null
                ? ` · ${active.score}%`
                : active.accuracy !== null
                  ? ` · 正确率 ${active.accuracy}%`
                  : ""}
            </span>
          )}
          <Button
            type="button"
            onClick={active.reset}
            disabled={active.answeredCount === 0}
            title="收拾重做"
            variant="ghost"
            size="icon"
            className="!w-auto !h-auto !p-1.5"
          >
            <RotateCcw size={15} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 pt-2 border-b border-hairline">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-1.5 text-[13px] rounded-t-md border-b-2 -mb-px transition-colors flex items-center gap-1.5",
                tab === t.key
                  ? "border-brand-500 text-ink font-medium"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              {t.badge}
            </button>
          ))}
      </div>

      {/* Body */}
      <div className="px-4 pb-4 pt-1">
        {tab === "vocab" && <VocabBody session={vocab} />}
        {tab === "practice" && (
          <PracticeBody
            session={practice}
            isPro={isPro}
            levelLabel={levelLabel}
          />
        )}
        {tab === "quiz" && <QuizBody session={quiz} />}
      </div>
    </div>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

function VocabBody({ session }: { session: SessionLike<VocabDrillItem> }) {
  if (session.loading) return <LoadingRow label="加载词汇练习…" />;
  if (session.items.length === 0)
    return (
      <p className="py-4 text-sm text-muted">
        该视频暂无目标等级词汇可供练习。
      </p>
    );
  return (
    <>
      {session.items.map((it, i) => {
        const g = session.graded[i] ?? null;
        const locked = !!g;
        if (it.kind === "spelling") {
          return (
            <QuestionCard
              key={i}
              prompt={`${i + 1}. 拼写`}
              hint={`写出英文单词：${it.translation || "（无译文）"}`}
              graded={g}
            >
              <Input
                type="text"
                placeholder="输入英文单词..."
                value={session.answers[i] || ""}
                onChange={(e) => session.setAnswer(i, e.target.value)}
                disabled={locked}
                className="mt-1"
              />
              {!locked && (
                <CheckButton
                  onClick={() => session.gradeAnswer(i)}
                  disabled={!session.answers[i]}
                />
              )}
            </QuestionCard>
          );
        }
        return (
          <QuestionCard
            key={i}
            prompt={`${i + 1}. 选择释义`}
            hint={it.word}
            graded={g}
          >
            <OptionList
              name={`vd-${i}`}
              options={it.options || []}
              selected={session.answers[i]}
              graded={g}
              locked={locked}
              onSelect={(opt) => session.gradeAnswer(i, opt)}
            />
          </QuestionCard>
        );
      })}
    </>
  );
}

function PracticeBody({
  session,
  isPro,
  levelLabel,
}: {
  session: SessionLike<PracticeQuestion>;
  isPro: boolean;
  levelLabel: string;
}) {
  if (!isPro) return <ProUpsell levelLabel={levelLabel} />;
  if (session.loading) return <LoadingRow label="AI 正在生成练习题…" />;
  if (session.error)
    return (
      <div className="py-4">
        <p className="text-sm text-ink/70 mb-2">{session.error}</p>
        <Button variant="outline" size="sm" onClick={() => session.refetch()}>
          重试
        </Button>
      </div>
    );
  if (session.items.length === 0)
    return <p className="py-4 text-sm text-muted">暂无练习题。</p>;
  return (
    <>
      {session.items.map((q, i) => {
        const g = session.graded[i] ?? null;
        const locked = !!g;
        const grading = !!session.grading[i];
        const passage = q.type === "reading" ? q.passage : null;
        let input: ReactNode;
        if (q.type === "sentence_building" && q.tokens) {
          input = (
            <>
              <SentenceBuilderInput
                tokens={q.tokens}
                value={session.answers[i] || ""}
                onChange={(v) => session.setAnswer(i, v)}
                disabled={locked}
              />
              {!locked && (
                <CheckButton
                  onClick={() => session.gradeAnswer(i)}
                  disabled={!session.answers[i]}
                  grading={grading}
                />
              )}
            </>
          );
        } else if (q.options) {
          input = (
            <OptionList
              name={`pq-${i}`}
              options={q.options}
              selected={session.answers[i]}
              graded={g}
              locked={locked}
              onSelect={(opt) => session.gradeAnswer(i, opt)}
            />
          );
        } else if (q.type === "fill_blank") {
          input = (
            <>
              <Input
                type="text"
                placeholder="输入答案..."
                value={session.answers[i] || ""}
                onChange={(e) => session.setAnswer(i, e.target.value)}
                disabled={locked}
                className="mt-1"
              />
              {!locked && (
                <CheckButton
                  onClick={() => session.gradeAnswer(i)}
                  disabled={!session.answers[i]}
                  grading={grading}
                />
              )}
            </>
          );
        } else {
          input = (
            <>
              <Textarea
                placeholder="输入你的答案..."
                value={session.answers[i] || ""}
                onChange={(e) => session.setAnswer(i, e.target.value)}
                disabled={locked}
                rows={2}
                className="mt-1"
              />
              {!locked && (
                <CheckButton
                  onClick={() => session.gradeAnswer(i)}
                  disabled={!session.answers[i]}
                  grading={grading}
                />
              )}
            </>
          );
        }
        return (
          <QuestionCard
            key={i}
            prompt={`${i + 1}. ${q.question}`}
            passage={passage}
            graded={g}
            grading={grading}
          >
            {input}
          </QuestionCard>
        );
      })}
    </>
  );
}

function QuizBody({
  session,
}: {
  session: SessionLike<QuizQuestion> & {
    allGraded: boolean;
    recordScore: () => Promise<void>;
  };
}) {
  if (session.loading) return <LoadingRow label="加载理解测验…" />;
  if (session.items.length === 0)
    return <p className="py-4 text-sm text-muted">暂无测验题。</p>;
  return (
    <>
      {session.items.map((q, i) => {
        const g = session.graded[i] ?? null;
        const locked = !!g;
        let input: ReactNode;
        if (q.type === "comprehension" && q.options) {
          input = (
            <OptionList
              name={`q-${i}`}
              options={q.options}
              selected={session.answers[i]}
              graded={g}
              locked={locked}
              onSelect={(opt) => session.gradeAnswer(i, opt)}
            />
          );
        } else if (q.type === "fill_blank") {
          input = (
            <>
              <Input
                type="text"
                placeholder="输入答案..."
                value={session.answers[i] || ""}
                onChange={(e) => session.setAnswer(i, e.target.value)}
                disabled={locked}
                className="mt-1"
              />
              {!locked && (
                <CheckButton
                  onClick={() => session.gradeAnswer(i)}
                  disabled={!session.answers[i]}
                />
              )}
            </>
          );
        } else {
          input = (
            <>
              <Textarea
                placeholder="写出你听到的内容..."
                value={session.answers[i] || ""}
                onChange={(e) => session.setAnswer(i, e.target.value)}
                disabled={locked}
                rows={2}
                className="mt-1"
              />
              {!locked && (
                <CheckButton
                  onClick={() => session.gradeAnswer(i)}
                  disabled={!session.answers[i]}
                />
              )}
            </>
          );
        }
        return (
          <QuestionCard key={i} prompt={`${i + 1}. ${q.question}`} graded={g}>
            {input}
          </QuestionCard>
        );
      })}
      <Button
        fullWidth
        onClick={session.recordScore}
        disabled={!session.allGraded}
      >
        完成测验
      </Button>
    </>
  );
}
