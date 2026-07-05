"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  Volume2,
  Check,
  X,
  RotateCcw,
  Loader2,
  Trophy,
  Mic,
  MicOff,
} from "lucide-react";
import type { GradedResult, PracticeItem } from "@/types";
import { usePracticeAudio } from "@/hooks/usePracticeAudio";
import { useSpeakingRecorder } from "@/hooks/useSpeakingRecorder";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

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
    <div className="rounded-xl border border-hairline bg-surface-soft p-4 space-y-3">
      <div className="font-semibold text-ink">{prompt}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
      {children}
      {grading && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> 判分中…
        </div>
      )}
      {graded && (
        <div
          className={`text-sm font-medium ${graded.correct ? "text-emerald-600" : "text-red-500"}`}
        >
          {graded.correct
            ? "✓ 正确"
            : `✗ 正确答案：${graded.correctAnswer ?? graded.explanation ?? ""}`}
        </div>
      )}
    </div>
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
        const isCorrect =
          graded?.correctAnswer === opt || (graded?.correct && isSelected);
        const isWrong = isSelected && graded && !graded.correct;
        return (
          <label
            key={i}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm
              ${locked ? "cursor-default" : "hover:border-ink/30"}
              ${isCorrect ? "border-emerald-400 bg-emerald-50 text-emerald-700" : ""}
              ${isWrong ? "border-red-400 bg-red-50 text-red-700" : ""}
              ${!isCorrect && !isWrong ? "border-hairline bg-white" : ""}`}
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
                ${isCorrect ? "border-emerald-500 bg-emerald-500" : ""}
                ${isWrong ? "border-red-500 bg-red-500" : ""}`}
            >
              {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <span>{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

function CheckButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="compact"
      onClick={onClick}
      disabled={disabled}
    >
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
    <div className="rounded-xl border border-hairline bg-surface-soft p-5 text-center space-y-3">
      <Trophy className="mx-auto text-amber-500" size={32} />
      <div className="text-lg font-semibold text-ink">练习完成！</div>
      <div className="text-sm text-muted">
        {correct} / {total} 正确
        {accuracy !== null && ` (${Math.round(accuracy)}%)`}
      </div>
      <div className="flex justify-center gap-3 pt-1">
        {!submitted && (
          <Button onClick={onSubmit} size="compact">
            保存学习记录
          </Button>
        )}
        {submitted && (
          <span className="text-xs text-emerald-600">✓ 已同步</span>
        )}
        <Button
          variant="outline"
          size="compact"
          onClick={onRetry}
          icon={RotateCcw}
        >
          重新练习
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practice-specific sub-components
// ---------------------------------------------------------------------------

function AudioPlayButton({
  onPlay,
  isPlaying,
}: {
  onPlay: () => void;
  isPlaying: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors
        ${isPlaying ? "bg-ink text-white" : "bg-ink/5 text-ink hover:bg-ink/10"}`}
    >
      <Volume2 size={14} />
      {isPlaying ? "播放中…" : "播放"}
    </button>
  );
}

function WordDisplay({
  word,
  phonetic,
}: {
  word: string;
  phonetic?: string | null;
}) {
  return (
    <span>
      <span className="font-semibold text-ink">{word}</span>
      {phonetic && (
        <span className="ml-1.5 text-xs text-muted">/{phonetic}/</span>
      )}
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
        className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
      >
        读对了
      </Button>
      <Button
        variant="outline"
        size="compact"
        onClick={onWrong}
        icon={X}
        className="text-red-500 border-red-300 hover:bg-red-50"
      >
        需练习
      </Button>
    </div>
  );
}

function RecordAndEvaluate({
  sentence,
  onResult,
}: {
  sentence: string;
  onResult: (correct: boolean) => void;
}) {
  const { speakingState, startRecording, stopRecording, audioUrl } =
    useSpeakingRecorder(() => true);
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
        className={isRecording ? "text-red-500" : ""}
      >
        {isRecording ? "停止录音" : "录音"}
      </Button>
      {hasRecorded && audioUrl && (
        <div className="space-y-2">
          <audio controls src={audioUrl} className="h-8 w-full" />
          <div className="text-xs text-muted mb-1">
            回放你的录音，然后自评：
          </div>
          <SelfEvaluateButtons
            onCorrect={() => onResult(true)}
            onWrong={() => onResult(false)}
          />
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
              <span className="text-sm text-muted">听发音，选择正确释义</span>
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
            <div className="text-sm text-muted">暂无选项</div>
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
            <div className="text-sm text-muted">暂无选项</div>
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
            {!locked && (
              <CheckButton
                onClick={() => onGrade()}
                disabled={!answer.trim()}
              />
            )}
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
              <span className="text-sm text-muted">听发音，拼写单词</span>
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
            {!locked && (
              <CheckButton
                onClick={() => onGrade()}
                disabled={!answer.trim()}
              />
            )}
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
              {!locked && (
                <CheckButton
                  onClick={() => onGrade()}
                  disabled={!answer.trim()}
                />
              )}
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
                onPlay={() =>
                  audio.playSentence(item.full_sentence ?? item.word)
                }
                isPlaying={
                  audio.playingText === (item.full_sentence ?? item.word)
                }
              />
              <span className="text-sm text-muted">听句子，跟读并自评</span>
            </div>
          }
          hint={item.full_sentence ?? undefined}
          graded={graded}
          grading={grading}
        >
          {!locked && (
            <RecordAndEvaluate
              sentence={item.full_sentence ?? item.word}
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

export function UnifiedPracticePanel({
  session,
  levelLabel,
}: UnifiedPracticePanelProps) {
  const audio = usePracticeAudio();
  const [submitted, setSubmitted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const total = session.items.length;
  const currentGraded = session.graded[currentIndex] ?? null;

  // Auto-advance ~800ms after a correct answer (lets the learner see the ✓).
  useEffect(() => {
    if (!currentGraded?.correct) return;
    if (currentIndex >= total - 1) return;
    const t = setTimeout(() => setCurrentIndex((i) => i + 1), 800);
    return () => clearTimeout(t);
  }, [currentGraded, currentIndex, total]);

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
      <div className="flex items-center gap-2 text-sm text-muted py-4">
        <Loader2 size={14} className="animate-spin" /> 加载练习中…
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="text-sm text-red-500 py-4">
        {session.error}
        <Button
          variant="outline"
          size="compact"
          className="ml-2"
          onClick={() => session.refetch()}
        >
          重试
        </Button>
      </div>
    );
  }

  if (!total) {
    return (
      <div className="text-sm text-muted py-4">
        该视频暂无目标等级词汇可供练习。
      </div>
    );
  }

  // Completion screen — show once every item has been graded.
  if (session.allGraded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {session.items.map((_, i) => {
            const g = session.graded[i];
            return (
              <span
                key={i}
                className={cn(
                  "h-2 w-2 rounded-full",
                  g?.correct ? "bg-emerald-500" : "bg-red-400",
                )}
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
          <span className="text-xs px-1.5 py-0.5 rounded bg-ink/5 text-muted">
            {levelLabel}
          </span>
          <span className="text-xs text-muted">
            {currentIndex + 1} / {total}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="text-emerald-600">✓ {session.correctCount}</span>
          <span className="text-red-500">✗ {wrongCount}</span>
          <Button
            variant="ghost"
            size="compact"
            onClick={handleRetry}
            icon={RotateCcw}
          >
            重置
          </Button>
        </div>
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
                !isCurrent && g?.correct && "bg-emerald-500",
                !isCurrent && g && !g.correct && "bg-red-400",
                !isCurrent && !g && "bg-hairline",
              )}
            />
          );
        })}
      </div>

      {/* Current item only — one-at-a-time focused drill */}
      <PracticeItemRenderer
        key={currentIndex}
        item={session.items[currentIndex]}
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
        <div className="flex justify-end">
          <Button onClick={() => setCurrentIndex((i) => i + 1)}>下一题</Button>
        </div>
      )}
    </div>
  );
}
