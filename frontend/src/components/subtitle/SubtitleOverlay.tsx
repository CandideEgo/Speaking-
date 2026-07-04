"use client";

import { cn } from "@/lib/utils";
import { Mic } from "lucide-react";
import type { Subtitle } from "@/types";

interface Props {
  subtitle: Subtitle | null;
  showEnglishOnly: boolean;
  onWordClick: (word: string) => void;
  selectedWord: string | null;
  onStartSpeaking: (subtitleId: string) => void;
}

export default function SubtitleOverlay({
  subtitle,
  showEnglishOnly,
  onWordClick,
  selectedWord,
  onStartSpeaking,
}: Props) {
  if (!subtitle) return null;

  return (
    <div className="pointer-events-none absolute bottom-16 left-0 right-0 flex justify-center z-10">
      <div className="pointer-events-auto rounded-lg bg-black/70 px-6 py-3 text-center max-w-[90%]">
        <p className="text-white text-lg leading-relaxed">
          {subtitle.text_en.split(" ").map((word, wi) => {
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
                  "cursor-pointer rounded hover:bg-white/20",
                  selectedWord === clean && "bg-brand-500/40",
                )}
              >
                {word}{" "}
              </span>
            );
          })}
        </p>
        {!showEnglishOnly && subtitle.text_zh && (
          <p className="text-slate-300 text-sm mt-1">{subtitle.text_zh}</p>
        )}
        {subtitle.grammar_note && (
          <p className="text-amber-400 text-xs mt-1">
            Tip: {subtitle.grammar_note}
          </p>
        )}
        <button
          onClick={() => onStartSpeaking(subtitle.id)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-brand-400 hover:underline"
          aria-label="练习这句"
        >
          <Mic size={12} /> Practice this line
        </button>
      </div>
    </div>
  );
}
