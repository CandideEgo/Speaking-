"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Volume2, Eye, EyeOff, Check, X } from "lucide-react";
import type { Subtitle } from "@/types";
import { useSpeech } from "@/hooks/useSpeech";
import { useSentenceNavigation } from "@/hooks/useSentenceNavigation";

interface ReadingModeProps {
  subtitles: Subtitle[];
  selectedWord: string | null;
  onWordClick: (word: string) => void;
}

export default function ReadingMode({ subtitles, selectedWord, onWordClick }: ReadingModeProps) {
  const [showTranslation, setShowTranslation] = useState(true);

  const { speak } = useSpeech();

  const { selectedIndex, nextSentence, prevSentence, isFirst, isLast } = useSentenceNavigation({
    totalSentences: subtitles.length,
  });

  const current = subtitles[selectedIndex];
  if (!current) return null;

  function handleSpeak() {
    speak(current.text_en, { rate: 1 });
  }

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">
          {selectedIndex + 1} / {subtitles.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            className="text-muted-foreground hover:text-ink"
            aria-label={showTranslation ? "隐藏翻译" : "显示翻译"}
          >
            {showTranslation ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            onClick={handleSpeak}
            className="text-muted-foreground hover:text-coral"
            aria-label="朗读此句"
          >
            <Volume2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-lg">
          <p className="text-lg leading-relaxed text-ink font-medium">
            {current.text_en.split(" ").map((word, wi) => {
              const clean = word.replace(/[.,!?;:'"]/g, "");
              return (
                <span
                  key={wi}
                  onClick={() => onWordClick(word)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onWordClick(word);
                    }
                  }}
                  className={cn(
                    "cursor-pointer rounded hover:bg-coral/20 transition-colors",
                    selectedWord === clean && "bg-coral/30"
                  )}
                >
                  {word}{" "}
                </span>
              );
            })}
          </p>
          {showTranslation && current.text_zh && (
            <p className="mt-4 text-sm text-muted-foreground">{current.text_zh}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          onClick={prevSentence}
          disabled={isFirst}
          className="btn-secondary !py-2 !px-4 text-xs disabled:opacity-30"
        >
          上一句
        </button>
        <button
          onClick={nextSentence}
          disabled={isLast}
          className="btn-primary !py-2 !px-4 text-xs disabled:opacity-30"
        >
          下一句
        </button>
      </div>
    </div>
  );
}
