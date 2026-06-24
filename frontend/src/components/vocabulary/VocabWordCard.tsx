"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Sparkles, Loader2, Volume2 } from "lucide-react";
import type { VocabularyWord, MasteryLevel } from "@/types";

interface VocabWordCardProps {
  word: VocabularyWord;
  onEnrich?: (wordId: string) => void;
  onPronounce?: (word: string) => void;
  isEnriching?: boolean;
}

const MASTERY_COLORS: Record<MasteryLevel, string> = {
  new: "bg-slate-500/20 text-slate-400",
  learning: "bg-amber-500/20 text-amber-400",
  reviewing: "bg-blue-500/20 text-blue-400",
  mastered: "bg-green-500/20 text-green-400",
};

const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: "New",
  learning: "Learning",
  reviewing: "Reviewing",
  mastered: "Mastered",
};

export default function VocabWordCard({
  word,
  onEnrich,
  onPronounce,
  isEnriching = false,
}: VocabWordCardProps) {
  const [showExamples, setShowExamples] = useState(false);

  function handlePronounce() {
    if (onPronounce) {
      onPronounce(word.word);
    } else {
      const u = new SpeechSynthesisUtterance(word.word);
      u.lang = "en-US";
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  }

  return (
    <div className="rounded-lg border border-hairline bg-canvas p-4 transition-all hover:border-coral/30 hover:shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-ink">{word.word}</h3>
            {word.ipa && (
              <span className="text-xs text-muted-foreground font-mono">{word.ipa}</span>
            )}
            {word.part_of_speech && (
              <span className="shrink-0 rounded-sm bg-cream-soft px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {word.part_of_speech}
              </span>
            )}
          </div>
          {/* Mastery level */}
          <div className="mt-1 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                MASTERY_COLORS[word.mastery_level]
              )}
            >
              {MASTERY_LABELS[word.mastery_level]}
            </span>
            {word.review_count > 0 && (
              <span className="text-[10px] text-muted-foreground">{word.review_count} reviews</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={handlePronounce}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-cream-soft hover:text-ink transition-colors"
            title="Pronounce"
          >
            <Volume2 size={16} />
          </button>
          {onEnrich && (
            <button
              onClick={() => onEnrich(word.id)}
              disabled={isEnriching}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-coral/10 hover:text-coral transition-colors disabled:opacity-50"
              title="Enrich with AI"
            >
              {isEnriching ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Definitions */}
      <div className="mt-3">
        {word.definition && <p className="text-sm text-ink/80">{word.definition}</p>}
        {word.definition_zh && (
          <p className="mt-1 text-sm text-muted-foreground">{word.definition_zh}</p>
        )}
        {!word.definition && !word.definition_zh && (
          <p className="text-xs text-muted-foreground italic">
            No definition yet. Click enrich to add details.
          </p>
        )}
      </div>

      {/* Example sentences (collapsible) */}
      {word.example_sentences && word.example_sentences.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowExamples(!showExamples)}
            className="flex items-center gap-1 text-xs text-coral hover:underline"
          >
            {showExamples ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showExamples ? "Hide" : "Show"} examples ({word.example_sentences.length})
          </button>
          {showExamples && (
            <ul className="mt-2 space-y-1.5">
              {word.example_sentences.map((sentence: string, i: number) => (
                <li key={i} className="rounded-md bg-cream-soft px-3 py-1.5 text-xs text-ink/70">
                  {sentence}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Next review indicator */}
      {word.next_review_at && (
        <div className="mt-3 border-t border-hairline pt-2">
          <span className="text-[10px] text-muted-foreground">
            Next review: {new Date(word.next_review_at).toLocaleDateString()}
          </span>
        </div>
      )}
    </div>
  );
}
