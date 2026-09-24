"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Volume2, Check, X, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSpeech } from "@/hooks/useSpeech";
import type { VocabularyWord } from "@/types";

/**
 * 百词斩式新词闪卡（/vocabulary/drill 学新词阶段）。
 * 卡面：大单词 + IPA + 喇叭（进卡自动发音一次）+ 语境例句；
 * 「认识」直接下一张，「不认识」展开详解后「下一个」。
 * 键盘：1 = 认识/下一个，2 = 不认识。
 */
export function WordFlashcard({
  word,
  index,
  total,
  onGrade,
}: {
  word: VocabularyWord;
  index: number;
  total: number;
  onGrade: (known: boolean) => void;
}) {
  const { speak } = useSpeech();
  const [revealed, setRevealed] = useState(false);

  // 新卡进场：重置揭晓态并自动发音一次（百词斩先听音再判认识）。
  useEffect(() => {
    setRevealed(false);
    speak(word.word, { rate: 0.9 });
  }, [word.id, word.word, speak]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "1") {
        if (revealed) onGrade(false);
        else onGrade(true);
      } else if (e.key === "2" && !revealed) {
        setRevealed(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [revealed, onGrade]);

  const example =
    word.example_sentences?.[0] ?? (word.context_sentence ? `“${word.context_sentence}”` : null);

  return (
    <div className="w-full max-w-[640px] mx-auto">
      {/* 进度行 */}
      <div className="flex items-center justify-between mb-3 text-xs text-muted">
        <span className="font-semibold text-brand-500">
          新词 {index + 1} / {total}
        </span>
        <button
          onClick={() => speak(word.word, { rate: 0.9 })}
          className="inline-flex items-center gap-1.5 text-muted hover:text-ink transition-colors cursor-pointer"
          aria-label={`播放 ${word.word}`}
        >
          <Volume2 size={14} />
          再听一次
        </button>
      </div>

      {/* 卡面 */}
      <div className="bg-canvas border border-hairline rounded-2xl shadow-lift px-6 py-10 sm:px-10 text-center animate-fade-in">
        <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ink">
          {word.word}
        </div>
        {word.ipa && <div className="text-sm text-muted mt-2 font-mono">{word.ipa}</div>}
        {example && (
          <p className="text-[13px] text-muted leading-relaxed mt-5 max-w-[420px] mx-auto line-clamp-3">
            {example}
          </p>
        )}

        {/* 详解区：点「不认识」后展开 */}
        {revealed && (
          <div className="mt-6 pt-5 border-t border-hairline text-left animate-fade-slide-in">
            {word.part_of_speech && (
              <p className="text-xs text-muted-soft italic">{word.part_of_speech}</p>
            )}
            <p className="text-[15px] text-ink font-medium leading-relaxed mt-1">
              {word.translation || word.definition || "—"}
            </p>
            {word.example_sentences && word.example_sentences.length > 1 && (
              <ul className="mt-3 space-y-1">
                {word.example_sentences.slice(1, 3).map((s, i) => (
                  <li key={i} className="text-[13px] text-muted leading-relaxed">
                    · {s}
                  </li>
                ))}
              </ul>
            )}
            {word.video_id && (
              <Link
                href={`/watch/${word.video_id}`}
                className="inline-flex items-center gap-1 mt-3 text-xs text-brand-500 hover:underline"
              >
                <ExternalLink size={12} />
                去看原视频 →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* 操作区 */}
      <div className="flex gap-3 mt-5">
        {revealed ? (
          <Button size="lg" className="flex-1" onClick={() => onGrade(false)}>
            下一个
            <ArrowRight size={16} className="ml-1" />
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              variant="outline"
              className="flex-1 border-success/50 text-success hover:bg-success-soft"
              onClick={() => onGrade(true)}
            >
              <Check size={16} className="mr-1" />
              认识
            </Button>
            <Button size="lg" className="flex-1" onClick={() => setRevealed(true)}>
              <X size={16} className="mr-1" />
              不认识
            </Button>
          </>
        )}
      </div>
      <p className="text-center text-[11px] text-muted-soft mt-3">键盘 1 = 认识 · 2 = 不认识</p>
    </div>
  );
}
