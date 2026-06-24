"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, X, Loader2, ChevronRight, RotateCcw } from "lucide-react";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import type { QuizType, VocabQuizQuestion } from "@/types";

const QUIZ_TYPE_TABS: { value: QuizType; label: string }[] = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "spelling", label: "Spelling" },
  { value: "context_fill", label: "Context Fill" },
  { value: "translation", label: "Translation" },
];

function MultipleChoiceQuestion({
  question,
  index,
  selectedAnswer,
  onAnswer,
  showResult,
  isCorrect,
}: {
  question: VocabQuizQuestion;
  index: number;
  selectedAnswer: string;
  onAnswer: (answer: string) => void;
  showResult: boolean;
  isCorrect: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">What does &ldquo;{question.word}&rdquo; mean?</p>
      <div className="mt-3 space-y-2">
        {question.options?.map((opt: string, oi: number) => {
          const isSelected = selectedAnswer === opt;
          const isCorrectOption = opt === question.correct_answer;
          return (
            <button
              key={oi}
              onClick={() => !showResult && onAnswer(opt)}
              disabled={showResult}
              className={cn(
                "w-full flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm text-left transition-colors",
                showResult
                  ? isCorrectOption
                    ? "border-green-500/50 bg-green-500/10 text-green-400"
                    : isSelected
                      ? "border-red-500/50 bg-red-500/10 text-red-400"
                      : "border-hairline text-muted-foreground"
                  : isSelected
                    ? "border-coral bg-coral/10 text-coral"
                    : "border-hairline hover:bg-white/5 text-ink/80"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  showResult && isCorrectOption
                    ? "border-green-500 bg-green-500 text-white"
                    : showResult && isSelected && !isCorrectOption
                      ? "border-red-500 bg-red-500 text-white"
                      : isSelected
                        ? "border-coral bg-coral text-white"
                        : "border-hairline"
                )}
              >
                {showResult && isCorrectOption ? (
                  <Check size={10} />
                ) : showResult && isSelected && !isCorrectOption ? (
                  <X size={10} />
                ) : isSelected ? (
                  <Check size={10} />
                ) : null}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpellingQuestion({
  question,
  index,
  selectedAnswer,
  onAnswer,
  showResult,
  isCorrect,
}: {
  question: VocabQuizQuestion;
  index: number;
  selectedAnswer: string;
  onAnswer: (answer: string) => void;
  showResult: boolean;
  isCorrect: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">
        Type the word that matches: {question.question}
      </p>
      <input
        type="text"
        value={selectedAnswer}
        onChange={(e) => !showResult && onAnswer(e.target.value)}
        disabled={showResult}
        placeholder="Type the word..."
        autoFocus
        className={cn(
          "mt-3 w-full rounded-md border px-3 py-2.5 text-sm focus:outline-none focus:ring-1",
          showResult
            ? isCorrect
              ? "border-green-500/50 bg-green-500/5 text-green-400 focus:ring-green-500/20"
              : "border-red-500/50 bg-red-500/5 text-red-400 focus:ring-red-500/20"
            : "border-hairline bg-white text-ink focus:border-coral focus:ring-coral/20"
        )}
      />
      {showResult && !isCorrect && (
        <p className="mt-1.5 text-xs text-green-400">
          Correct answer: <span className="font-medium">{question.correct_answer}</span>
        </p>
      )}
    </div>
  );
}

function ContextFillQuestion({
  question,
  index,
  selectedAnswer,
  onAnswer,
  showResult,
  isCorrect,
}: {
  question: VocabQuizQuestion;
  index: number;
  selectedAnswer: string;
  onAnswer: (answer: string) => void;
  showResult: boolean;
  isCorrect: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">Fill in the blank:</p>
      {question.context && (
        <p className="mt-2 text-sm text-ink/70 italic">
          &ldquo;
          {question.context.replace(
            "___",
            (
              <span className="inline-block min-w-[60px] border-b-2 border-coral mx-1 not-italic" />
            ) as unknown as string
          )}
          &rdquo;
        </p>
      )}
      <input
        type="text"
        value={selectedAnswer}
        onChange={(e) => !showResult && onAnswer(e.target.value)}
        disabled={showResult}
        placeholder="Type the missing word..."
        autoFocus
        className={cn(
          "mt-3 w-full rounded-md border px-3 py-2.5 text-sm focus:outline-none focus:ring-1",
          showResult
            ? isCorrect
              ? "border-green-500/50 bg-green-500/5 text-green-400 focus:ring-green-500/20"
              : "border-red-500/50 bg-red-500/5 text-red-400 focus:ring-red-500/20"
            : "border-hairline bg-white text-ink focus:border-coral focus:ring-coral/20"
        )}
      />
      {showResult && !isCorrect && (
        <p className="mt-1.5 text-xs text-green-400">
          Correct answer: <span className="font-medium">{question.correct_answer}</span>
        </p>
      )}
    </div>
  );
}

function TranslationQuestion({
  question,
  index,
  selectedAnswer,
  onAnswer,
  showResult,
  isCorrect,
}: {
  question: VocabQuizQuestion;
  index: number;
  selectedAnswer: string;
  onAnswer: (answer: string) => void;
  showResult: boolean;
  isCorrect: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">
        Translate: <span className="font-semibold">{question.word}</span>
      </p>
      <input
        type="text"
        value={selectedAnswer}
        onChange={(e) => !showResult && onAnswer(e.target.value)}
        disabled={showResult}
        placeholder="Type the translation..."
        autoFocus
        className={cn(
          "mt-3 w-full rounded-md border px-3 py-2.5 text-sm focus:outline-none focus:ring-1",
          showResult
            ? isCorrect
              ? "border-green-500/50 bg-green-500/5 text-green-400 focus:ring-green-500/20"
              : "border-red-500/50 bg-red-500/5 text-red-400 focus:ring-red-500/20"
            : "border-hairline bg-white text-ink focus:border-coral focus:ring-coral/20"
        )}
      />
      {showResult && !isCorrect && (
        <p className="mt-1.5 text-xs text-green-400">
          Correct answer: <span className="font-medium">{question.correct_answer}</span>
        </p>
      )}
    </div>
  );
}

export default function VocabQuizPanel() {
  const {
    quizSession,
    quizAnswers,
    quizResult,
    quizType,
    isQuizActive,
    isQuizSubmitting,
    isLoading,
    startQuiz,
    answerQuestion,
    submitQuiz,
    resetQuiz,
  } = useVocabularyStore();

  const [showResult, setShowResult] = useState(false);

  // Not in a quiz — show setup
  if (!isQuizActive || !quizSession) {
    return (
      <div className="rounded-lg border border-hairline bg-canvas p-6">
        <h3 className="text-sm font-medium text-ink">Vocabulary Quiz</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Test your vocabulary knowledge with different quiz types.
        </p>

        {/* Quiz type tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          {QUIZ_TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => startQuiz(tab.value)}
              disabled={isLoading}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                quizType === tab.value
                  ? "bg-coral/10 text-coral"
                  : "bg-cream-soft text-muted-foreground hover:text-ink"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="mt-4 flex justify-center">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  // Quiz result
  if (quizResult) {
    const pct = Math.round((quizResult.correct / quizResult.total) * 100);
    return (
      <div className="rounded-lg border border-hairline bg-canvas p-6">
        <div className="text-center">
          <div
            className={cn(
              "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
              pct >= 70 ? "bg-green-500/10" : "bg-amber-500/10"
            )}
          >
            <span
              className={cn("text-2xl font-bold", pct >= 70 ? "text-green-500" : "text-amber-500")}
            >
              {pct}%
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-ink">
            {pct >= 70 ? "Great job!" : "Keep practicing!"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {quizResult.correct} / {quizResult.total} correct
          </p>
        </div>

        {/* Detail list */}
        <div className="mt-4 space-y-2">
          {quizResult.details.map(
            (d: { correct: boolean; user_answer: string; correct_answer: string }, i: number) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                  d.correct
                    ? "border-green-500/20 bg-green-500/5 text-green-400"
                    : "border-red-500/20 bg-red-500/5 text-red-400"
                )}
              >
                {d.correct ? <Check size={12} /> : <X size={12} />}
                <span className="flex-1">
                  Q{i + 1}: {d.user_answer || "(skipped)"}
                </span>
                {!d.correct && <span className="text-green-400">Answer: {d.correct_answer}</span>}
              </div>
            )
          )}
        </div>

        <button
          onClick={resetQuiz}
          className="mt-4 btn-primary w-full justify-center !py-2 text-xs gap-1.5"
        >
          <RotateCcw size={14} /> Try Again
        </button>
      </div>
    );
  }

  // Active quiz
  const currentQuestion = quizSession.questions[0]; // simplified: show first unanswered
  const currentIndex = Object.keys(quizAnswers).length;
  const question = quizSession.questions[currentIndex];
  const allAnswered = Object.keys(quizAnswers).length >= quizSession.questions.length;

  if (!question) return null;

  const selectedAnswer = quizAnswers[currentIndex] || "";

  function handleAnswer(answer: string) {
    answerQuestion(currentIndex, answer);
    setShowResult(true);
    // Auto-advance after a short delay
    setTimeout(() => {
      setShowResult(false);
    }, 1200);
  }

  function handleSubmit() {
    submitQuiz();
  }

  const isCorrect =
    selectedAnswer.trim().toLowerCase() === question.correct_answer.trim().toLowerCase();

  return (
    <div className="rounded-lg border border-hairline bg-canvas p-6">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>
            Question {currentIndex + 1} of {quizSession.total_questions}
          </span>
          <span>{Math.round((currentIndex / quizSession.total_questions) * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-cream-soft overflow-hidden">
          <div
            className="h-full rounded-full bg-coral transition-all duration-300"
            style={{ width: `${(currentIndex / quizSession.total_questions) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      {question.type === "multiple_choice" && (
        <MultipleChoiceQuestion
          question={question}
          index={currentIndex}
          selectedAnswer={selectedAnswer}
          onAnswer={handleAnswer}
          showResult={showResult}
          isCorrect={isCorrect}
        />
      )}
      {question.type === "spelling" && (
        <SpellingQuestion
          question={question}
          index={currentIndex}
          selectedAnswer={selectedAnswer}
          onAnswer={(a) => {
            answerQuestion(currentIndex, a);
          }}
          showResult={showResult}
          isCorrect={isCorrect}
        />
      )}
      {question.type === "context_fill" && (
        <ContextFillQuestion
          question={question}
          index={currentIndex}
          selectedAnswer={selectedAnswer}
          onAnswer={(a) => {
            answerQuestion(currentIndex, a);
          }}
          showResult={showResult}
          isCorrect={isCorrect}
        />
      )}
      {question.type === "translation" && (
        <TranslationQuestion
          question={question}
          index={currentIndex}
          selectedAnswer={selectedAnswer}
          onAnswer={(a) => {
            answerQuestion(currentIndex, a);
          }}
          showResult={showResult}
          isCorrect={isCorrect}
        />
      )}

      {/* Submit button (for text input types) */}
      {question.type !== "multiple_choice" && !showResult && selectedAnswer && (
        <button
          onClick={() => {
            setShowResult(true);
            setTimeout(() => setShowResult(false), 1200);
          }}
          className="mt-3 btn-primary !py-2 text-xs"
        >
          Check Answer
        </button>
      )}

      {/* Finish quiz */}
      {allAnswered && !showResult && (
        <button
          onClick={handleSubmit}
          disabled={isQuizSubmitting}
          className="mt-4 btn-primary w-full justify-center !py-2 text-xs gap-1.5"
        >
          {isQuizSubmitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ChevronRight size={14} />
          )}
          {isQuizSubmitting ? "Submitting..." : "Finish Quiz"}
        </button>
      )}
    </div>
  );
}
