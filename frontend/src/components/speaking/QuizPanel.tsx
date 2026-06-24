"use client";

import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/types";
import { Check } from "lucide-react";

interface QuizPanelProps {
  quizQuestions: QuizQuestion[];
  quizAnswers: Record<number, string>;
  quizSubmitted: boolean;
  quizScore: number | null;
  videoStatus: string;
  onAnswer: (qi: number, a: string) => void;
  onSubmit: () => void;
}

export default function QuizPanel({
  quizQuestions,
  quizAnswers,
  quizSubmitted,
  quizScore,
  videoStatus,
  onAnswer,
  onSubmit,
}: QuizPanelProps) {
  if (quizQuestions.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {videoStatus === "processing" || videoStatus === "ready_subtitles"
            ? "视频处理完成后测验将可用。"
            : "此视频没有测验。"}
        </p>
      </div>
    );
  }

  if (quizSubmitted && quizScore !== null) {
    const correctCount = quizQuestions.filter((q, i) => {
      const ua = (quizAnswers[i] || "").trim().toLowerCase();
      return ua === q.answer.trim().toLowerCase();
    }).length;

    return (
      <div className="text-center py-8">
        <div
          className={cn(
            "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
            quizScore >= 60 ? "bg-learn-correct/10" : "bg-learn-wrong/10"
          )}
        >
          <span
            className={cn(
              "text-2xl font-bold",
              quizScore >= 60 ? "text-learn-correct" : "text-coral"
            )}
          >
            {quizScore}%
          </span>
        </div>
        <p className="mt-3 text-sm font-medium text-ink">
          {quizScore >= 60 ? "太棒了！" : "继续加油！"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {correctCount} / {quizQuestions.length} 正确
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {quizQuestions.map((q, qi) => (
        <div key={qi} className="rounded-lg border border-hairline p-3">
          <p className="text-xs font-medium text-ink/75">
            {qi + 1}. {q.question}
          </p>
          {q.type === "comprehension" && q.options ? (
            <div className="mt-2 space-y-1.5">
              {q.options.map((opt, oi) => (
                <label
                  key={oi}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors",
                    quizAnswers[qi] === opt
                      ? "border-coral bg-coral/10 text-coral"
                      : "border-hairline hover:bg-cream-soft text-ink/70"
                  )}
                >
                  <input
                    type="radio"
                    name={`q-${qi}`}
                    value={opt}
                    checked={quizAnswers[qi] === opt}
                    onChange={(e) => onAnswer(qi, e.target.value)}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full border text-[10px]",
                      quizAnswers[qi] === opt
                        ? "border-coral bg-coral text-white"
                        : "border-hairline"
                    )}
                  >
                    {quizAnswers[qi] === opt && <Check size={10} />}
                  </span>
                  {opt}
                </label>
              ))}
            </div>
          ) : q.type === "fill_blank" ? (
            <input
              type="text"
              placeholder="输入答案..."
              value={quizAnswers[qi] || ""}
              onChange={(e) => onAnswer(qi, e.target.value)}
              className="mt-2 w-full rounded-md border border-hairline bg-cream-card px-3 py-2 text-sm text-ink focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20"
            />
          ) : (
            <textarea
              placeholder="写出你听到的内容..."
              value={quizAnswers[qi] || ""}
              onChange={(e) => onAnswer(qi, e.target.value)}
              rows={2}
              className="mt-2 w-full rounded-md border border-hairline bg-cream-card px-3 py-2 text-sm text-ink focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20"
            />
          )}
        </div>
      ))}
      <button
        onClick={onSubmit}
        disabled={Object.keys(quizAnswers).length < quizQuestions.length}
        className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        提交测验
      </button>
    </div>
  );
}
