"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Volume2, Check, X, RotateCcw, Loader2, Trophy, Mic, MicOff } from "lucide-react";
import type { GradedResult, PracticeItem } from "@/types";
import { usePracticeAudio } from "@/hooks/usePracticeAudio";
import { useSpeakingRecorder } from "@/hooks/useSpeakingRecorder";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { watchSentenceHref } from "@/lib/watchEntry";
import { Card } from "@/components/ui/Card";

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function QuestionCard({
  prompt,
  hint,
  graded,
  grading,
  children,
}: {
  prompt: ReactNode;
  hint?: ReactNode;
  graded?: GradedResult | null;
  grading?: boolean;
  children: ReactNode;
}) {
  return (
    <Card variant="soft" padding={4} className="space-y-3 animate-fade-in">
      <div className="font-semibold text-ink">{prompt}</div>
      {hint && <div className="text-copy text-muted leading-relaxed">{hint}</div>}
      {children}
      {grading && (
        <div className="flex items-center gap-1.5 text-copy text-muted">
          <Loader2 size={12} className="animate-spin" /> 判分中…
        </div>
      )}
      {graded && (
        <div
          className={`text-copy font-medium animate-fade-in ${graded.correct ? "text-success" : "text-error"}`}
        >
          {graded.correct
            ? "✓ 正确"
            : `✗ 正确答案：${graded.correctAnswer ?? graded.explanation ?? ""}`}
        </div>
      )}
    </Card>
  );
}

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
    <div className="space-y-1.5">
      {options.map((opt, i) => {
        const isSelected = selected === opt;
        const isCorrect = graded?.correctAnswer === opt || (graded?.correct && isSelected);
        const isWrong = isSelected && graded && !graded.correct;
        return (
          <label
            key={i}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-copy
              ${locked ? "cursor-default" : "hover:border-ink/30"}
              ${isCorrect ? "border-success/50 bg-success-soft text-success animate-check-pop" : ""}
              ${isWrong ? "border-error/50 bg-red-soft text-error animate-shake" : ""}
              ${!isCorrect && !isWrong ? "border-hairline bg-canvas" : ""}`}
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
            <span
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                ${isSelected ? "border-ink bg-ink" : "border-hairline"}
                ${isCorrect ? "border-success bg-success" : ""}
                ${isWrong ? "border-error bg-error" : ""}`}
            >
              {isSelected && <span className="w-2 h-2 rounded-full bg-canvas" />}
            </span>
            <span>{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

function CheckButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="compact" onClick={onClick} disabled={disabled}>
      检查答案
    </Button>
  );
}

function CompletionSummary({
  total,
  correct,
  accuracy,
  onRetry,
  onSubmit,
  submitted,
}: {
  total: number;
  correct: number;
  accuracy: number | null;
  onRetry: () => void;
  onSubmit: () => void;
  submitted: boolean;
}) {
  return (
    <Card variant="soft" padding={5} className="text-center space-y-3">
      <Trophy className="mx-auto text-warning animate-check-pop" size={32} />
      <div className="text-copy-lg font-semibold text-ink">练习完成！</div>
      <div className="text-copy text-muted">
        {correct} / {total} 正确
        {accuracy !== null && ` (${Math.round(accuracy)}%)`}
      </div>
      <div className="flex justify-center gap-3 pt-1">
        {!submitted && (
          <Button onClick={onSubmit} size="compact">
            保存学习记录
          </Button>
        )}
        {submitted && <span className="text-meta text-success">✓ 已同步</span>}
        <Button variant="outline" size="compact" onClick={onRetry} icon={RotateCcw}>
          重新练习
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Practice-specific sub-components
// ---------------------------------------------------------------------------

function AudioPlayButton({ onPlay, isPlaying }: { onPlay: () => void; isPlaying: boolean }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-copy font-medium transition-colors
        ${isPlaying ? "bg-ink text-canvas" : "bg-ink/5 text-ink hover:bg-ink/10"}`}
    >
      <Volume2 size={14} />
      {isPlaying ? "播放中…" : "播放"}
    </button>
  );
}

function WordDisplay({ word, phonetic }: { word: string; phonetic?: string | null }) {
  return (
    <span>
      <span className="font-semibold text-ink">{word}</span>
      {phonetic && <span className="ml-1.5 text-meta text-muted">/{phonetic}/</span>}
    </span>
  );
}

function TranslationDisplay({ translation }: { translation: string }) {
  return <span className="text-ink">{translation}</span>;
}

function SentenceWithBlank({ template }: { template: string }) {
  const parts = template.split("___");
  return (
    <span className="text-ink">
      {parts[0]}
      <span className="inline-block min-w-[60px] border-b-2 border-ink/40 mx-1 text-center text-muted">
        &nbsp;
      </span>
      {parts[1]}
    </span>
  );
}

function SelfEvaluateButtons({
  onCorrect,
  onWrong,
}: {
  onCorrect: () => void;
  onWrong: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="compact"
        onClick={onCorrect}
        icon={Check}
        className="text-success border-success/40 hover:bg-success-soft"
      >
        读对了
      </Button>
      <Button
        variant="outline"
        size="compact"
        onClick={onWrong}
        icon={X}
        className="text-error border-error/40 hover:bg-red-soft"
      >
        需练习
      </Button>
    </div>
  );
}

function RecordAndEvaluate({ onResult }: { onResult: (correct: boolean) => void }) {
  const { speakingState, startRecording, stopRecording, audioUrl } = useSpeakingRecorder(
    () => true
  );
  const isRecording = speakingState === "listening";
  const [hasRecorded, setHasRecorded] = useState(false);

  const handleRecord = () => {
    if (isRecording) {
      stopRecording();
      setHasRecorded(true);
    } else {
      startRecording();
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="compact"
        onClick={handleRecord}
        icon={isRecording ? MicOff : Mic}
        className={isRecording ? "text-error" : ""}
      >
        {isRecording ? "停止录音" : "录音"}
      </Button>
      {hasRecorded && audioUrl && (
        <div className="space-y-2">
          <audio controls src={audioUrl} className="h-8 w-full" />
          <div className="text-copy text-muted mb-1">回放你的录音，然后自评：</div>
          <SelfEvaluateButtons onCorrect={() => onResult(true)} onWrong={() => onResult(false)} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-item renderer
// ---------------------------------------------------------------------------

function PracticeItemRenderer({
  item,
  index,
  answer,
  graded,
  grading,
  onAnswer,
  onGrade,
  audio,
}: {
  item: PracticeItem;
  index: number;
  answer: string;
  graded: GradedResult | null;
  grading: boolean;
  onAnswer: (a: string) => void;
  onGrade: (a?: string) => void;
  audio: ReturnType<typeof usePracticeAudio>;
}) {
  const locked = !!graded;
  const name = `practice-${index}`;

  switch (item.type) {
    case "listen_choose_meaning":
      return (
        <QuestionCard
          prompt={
            <div className="flex items-center gap-2">
              <AudioPlayButton
                onPlay={() => audio.playWord(item.word)}
                isPlaying={audio.playingText === item.word}
              />
              <span className="text-copy text-muted">听发音，选择正确释义</span>
            </div>
          }
          graded={graded}
          grading={grading}
        >
          {item.options ? (
            <OptionList
              name={name}
              options={item.options}
              selected={answer}
              graded={graded}
              locked={locked}
              onSelect={(opt) => {
                onAnswer(opt);
                onGrade(opt);
              }}
            />
          ) : (
            <div className="text-copy text-muted">暂无选项</div>
          )}
        </QuestionCard>
      );

    case "see_word_choose_meaning":
      return (
        <QuestionCard
          prompt={
            <div className="flex items-center gap-2">
              <WordDisplay word={item.word} phonetic={item.phonetic} />
              <AudioPlayButton
                onPlay={() => audio.playWord(item.word)}
                isPlaying={audio.playingText === item.word}
              />
            </div>
          }
          hint="选择正确的中文释义"
          graded={graded}
          grading={grading}
        >
          {item.options ? (
            <OptionList
              name={name}
              options={item.options}
              selected={answer}
              graded={graded}
              locked={locked}
              onSelect={(opt) => {
                onAnswer(opt);
                onGrade(opt);
              }}
            />
          ) : (
            <div className="text-copy text-muted">暂无选项</div>
          )}
        </QuestionCard>
      );

    case "see_meaning_spell_word":
      return (
        <QuestionCard
          prompt={<TranslationDisplay translation={item.translation} />}
          hint="拼写对应的英文单词"
          graded={graded}
          grading={grading}
        >
          <div className="flex gap-2">
            <Input
              value={answer}
              onChange={(e) => onAnswer(e.target.value)}
              placeholder="输入英文单词…"
              disabled={locked}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !locked && answer.trim()) onGrade();
              }}
            />
            {!locked && <CheckButton onClick={() => onGrade()} disabled={!answer.trim()} />}
          </div>
        </QuestionCard>
      );

    case "listen_spell_word":
      return (
        <QuestionCard
          prompt={
            <div className="flex items-center gap-2">
              <AudioPlayButton
                onPlay={() => audio.playWord(item.word)}
                isPlaying={audio.playingText === item.word}
              />
              <span className="text-copy text-muted">听发音，拼写单词</span>
            </div>
          }
          graded={graded}
          grading={grading}
        >
          <div className="flex gap-2">
            <Input
              value={answer}
              onChange={(e) => onAnswer(e.target.value)}
              placeholder="输入英文单词…"
              disabled={locked}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !locked && answer.trim()) onGrade();
              }}
            />
            {!locked && <CheckButton onClick={() => onGrade()} disabled={!answer.trim()} />}
          </div>
        </QuestionCard>
      );

    case "context_fill":
      return (
        <QuestionCard
          prompt={
            item.sentence_template ? (
              <SentenceWithBlank template={item.sentence_template} />
            ) : (
              <TranslationDisplay translation={item.translation} />
            )
          }
          hint={item.phonetic ? `/${item.phonetic}/` : undefined}
          graded={graded}
          grading={grading}
        >
          {item.options ? (
            <OptionList
              name={name}
              options={item.options}
              selected={answer}
              graded={graded}
              locked={locked}
              onSelect={(opt) => {
                onAnswer(opt);
                onGrade(opt);
              }}
            />
          ) : (
            <div className="flex gap-2">
              <Input
                value={answer}
                onChange={(e) => onAnswer(e.target.value)}
                placeholder="填入单词…"
                disabled={locked}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !locked && answer.trim()) onGrade();
                }}
              />
              {!locked && <CheckButton onClick={() => onGrade()} disabled={!answer.trim()} />}
            </div>
          )}
        </QuestionCard>
      );

    case "sentence_repeat":
      return (
        <QuestionCard
          prompt={
            <div className="flex items-center gap-2">
              <AudioPlayButton
                onPlay={() => audio.playSentence(item.full_sentence ?? item.word)}
                isPlaying={audio.playingText === (item.full_sentence ?? item.word)}
              />
              <span className="text-copy text-muted">听句子，跟读并自评</span>
            </div>
          }
          hint={item.full_sentence ?? undefined}
          graded={graded}
          grading={grading}
        >
          {!locked && (
            <RecordAndEvaluate
              onResult={(correct) => {
                const ans = correct ? "self_correct" : "self_wrong";
                onAnswer(ans);
                onGrade(ans);
              }}
            />
          )}
        </QuestionCard>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main panel — unified, single-tab
// ---------------------------------------------------------------------------

interface SessionLike {
  loading: boolean;
  error: string | null;
  items: PracticeItem[];
  answers: Record<number, string>;
  graded: Record<number, GradedResult>;
  grading: Record<number, boolean>;
  answeredCount: number;
  correctCount: number;
  allGraded: boolean;
  score: number | null;
  accuracy: number | null;
  setAnswer: (index: number, answer: string) => void;
  gradeAnswer: (index: number, answer?: string) => void;
  reset: () => void;
  refetch: () => Promise<void>;
  submitResults: () => Promise<void>;
}

interface UnifiedPracticePanelProps {
  session: SessionLike;
  levelLabel: string;
}

export function UnifiedPracticePanel({ session, levelLabel }: UnifiedPracticePanelProps) {
  const audio = usePracticeAudio();
  const [submitted, setSubmitted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  // P1-5：答对自动前进是**偏好驱动**的持久开关，默认关闭（不改变既有默认行为）。
  // 偏好没到位时按 false 处理，宁可要用户多点一次也不擅自跳题。
  const { preferences, update } = useUserPreferences();
  const autoAdvance = preferences?.auto_advance_on_correct ?? false;

  const total = session.items.length;
  const currentGraded = session.graded[currentIndex] ?? null;

  // Auto-advance ~800ms after a correct answer (lets the learner see the ✓).
  // 答错保持手动：与「下一题」按钮的既有语义一致。
  useEffect(() => {
    if (!autoAdvance) return;
    if (!currentGraded?.correct) return;
    if (currentIndex >= total - 1) return;
    const t = setTimeout(() => setCurrentIndex((i) => i + 1), 800);
    return () => clearTimeout(t);
  }, [autoAdvance, currentGraded, currentIndex, total]);

  async function handleToggleAutoAdvance() {
    try {
      await update({ auto_advance_on_correct: !autoAdvance });
    } catch {
      toast.error("自动前进设置保存失败");
    }
  }

  // Reset to the first item whenever the item set reloads (level change /
  // refetch), so we never point past the end of a fresh list.
  useEffect(() => {
    setCurrentIndex(0);
    setSubmitted(false);
  }, [session.items]);

  const handleSubmitResults = async () => {
    await session.submitResults();
    setSubmitted(true);
  };

  const handleRetry = () => {
    session.reset();
    setSubmitted(false);
    setCurrentIndex(0);
  };

  if (session.loading) {
    return (
      <Card
        role="status"
        aria-label="加载练习中"
        variant="soft"
        padding={4}
        className="space-y-3 animate-fade-in"
      >
        <div className="skeleton-shimmer h-4 w-1/2 rounded-sm bg-surface-card" />
        <div className="skeleton-shimmer h-9 rounded-lg bg-surface-card" />
        <div className="skeleton-shimmer h-9 rounded-lg bg-surface-card" />
        <div className="skeleton-shimmer h-9 w-2/3 rounded-lg bg-surface-card" />
      </Card>
    );
  }

  if (session.error) {
    return (
      <div className="text-copy text-error py-4">
        {session.error}
        <Button variant="outline" size="compact" className="ml-2" onClick={() => session.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  if (!total) {
    return <div className="text-copy text-muted py-4">该视频暂无目标等级词汇可供练习。</div>;
  }

  // Completion screen — show once every item has been graded.
  if (session.allGraded) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-1.5 flex-wrap">
          {session.items.map((_, i) => {
            const g = session.graded[i];
            return (
              <span
                key={i}
                className={cn("h-2 w-2 rounded-full", g?.correct ? "bg-success" : "bg-error")}
              />
            );
          })}
        </div>
        <CompletionSummary
          total={total}
          correct={session.correctCount}
          accuracy={session.accuracy}
          onRetry={handleRetry}
          onSubmit={handleSubmitResults}
          submitted={submitted}
        />
      </div>
    );
  }

  const wrongCount = session.answeredCount - session.correctCount;
  const isLast = currentIndex >= total - 1;

  return (
    <div className="space-y-4">
      {/* Header: level + position + running score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">练习</span>
          <span className="text-meta px-1.5 py-0.5 rounded-md bg-ink/5 text-muted">
            {levelLabel}
          </span>
          {/* P1-5 进度语义：只保留「本轮 done/total」，去掉并存的「第 N 题」。 */}
          <span className="text-meta text-muted tabular-nums">
            本轮 {session.answeredCount} / {total}
          </span>
        </div>
        <div className="flex items-center gap-3 text-copy text-muted">
          <span className="text-success">✓ {session.correctCount}</span>
          <span className="text-error">✗ {wrongCount}</span>
          <Button variant="ghost" size="compact" onClick={handleRetry} icon={RotateCcw}>
            重置
          </Button>
        </div>
      </div>

      {/* 答对自动前进（P1-5）：持久化偏好开关，默认关闭。 */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-meta text-muted">答对后自动进入下一题</span>
        <button
          type="button"
          role="switch"
          aria-checked={autoAdvance}
          aria-label="答对后自动进入下一题"
          onClick={handleToggleAutoAdvance}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500/15",
            autoAdvance ? "bg-brand-500" : "bg-hairline"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
              autoAdvance ? "translate-x-4" : "translate-x-0"
            )}
          />
        </button>
      </div>

      {/* Progress dots — click to jump to any item */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {session.items.map((item, i) => {
          const g = session.graded[i];
          const isCurrent = i === currentIndex;
          return (
            <button
              key={`${item.word}-${item.type}-${i}`}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`第 ${i + 1} 题`}
              className={cn(
                "h-2 rounded-full transition-all",
                isCurrent ? "w-6 bg-ink" : "w-2",
                !isCurrent && g?.correct && "bg-success",
                !isCurrent && g && !g.correct && "bg-error",
                !isCurrent && !g && "bg-hairline"
              )}
            />
          );
        })}
      </div>

      {/* Current item only — one-at-a-time focused drill */}
      <PracticeItemRenderer
        key={currentIndex}
        item={session.items[currentIndex] ?? session.items[0]}
        index={currentIndex}
        answer={session.answers[currentIndex] ?? ""}
        graded={currentGraded}
        grading={session.grading[currentIndex] ?? false}
        onAnswer={(a) => session.setAnswer(currentIndex, a)}
        onGrade={(a) => session.gradeAnswer(currentIndex, a)}
        audio={audio}
      />

      {/* Wrong answer → manual "next" (correct answers auto-advance) */}
      {currentGraded && !currentGraded.correct && !isLast && (
        <div className="flex items-center justify-between animate-fade-in">
          {/* D3b: 回看原句 — only when the item was scoped to a video
              (drill/?video_id=) so the source subtitle/start_time are present. */}
          {(() => {
            const it = session.items[currentIndex];
            if (it?.video_id && it.subtitle_id && it.start_time != null) {
              return (
                <Link
                  href={watchSentenceHref(
                    it.video_id,
                    { from: "drill" },
                    { subtitleId: it.subtitle_id, startTime: it.start_time, word: it.word }
                  )}
                  className="text-meta text-brand-500 hover:underline"
                >
                  回看原句 →
                </Link>
              );
            }
            return <span />;
          })()}
          <Button onClick={() => setCurrentIndex((i) => i + 1)}>下一题</Button>
        </div>
      )}
    </div>
  );
}
