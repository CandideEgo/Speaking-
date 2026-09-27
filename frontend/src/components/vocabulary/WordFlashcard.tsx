"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Volume2, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSpeech } from "@/hooks/useSpeech";
import { watchSentenceHref } from "@/lib/watchEntry";
import { cn } from "@/lib/utils";
import { DRILL_KIND_LABEL, type DrillQuestion } from "@/lib/drillQuestions";

/**
 * 选择题卡（S5，设计文档 §4）：全程选择题取代旧的自评双按钮闪卡。
 * 三种题型共用一张卡：英→中（认词）、中→英（巩固）、听音选词（§4.4）。
 * 作答反馈（§4.2）：标对错 → 展开完整释义（词性/音标/释义/例句）→ 有原句时
 * 显示原句 + 「去原视频」→ 底部「下一个」必须手动点击才推进。
 * 新词首次出现（英→中）题干带原句语境，可从语境推断词义（§4.3）。
 */
export function WordQuizCard({
  question,
  onAnswer,
  onNext,
}: {
  question: DrillQuestion;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
}) {
  const { speak } = useSpeech();
  const [selected, setSelected] = useState<string | null>(null);
  const answered = selected !== null;
  const correct = selected === question.answer;
  const word = question.word;

  const handleSelect = useCallback(
    (option: string) => {
      if (selected !== null) return;
      setSelected(option);
      onAnswer(option === question.answer);
      // 作答后把单词读一遍，强化音形对应
      speak(word.word, { rate: 0.9 });
    },
    [selected, onAnswer, question.answer, speak, word.word]
  );

  // 进题：重置作答并自动发音（中→英不能读，会把答案读出来）。
  useEffect(() => {
    setSelected(null);
    if (question.kind !== "zh2en") speak(word.word, { rate: 0.9 });
  }, [question, word.word, speak]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (selected === null) {
        const idx = Number(e.key) - 1;
        if (Number.isInteger(idx) && idx >= 0 && idx < question.options.length) {
          handleSelect(question.options[idx]);
        }
      } else if (e.key === "Enter") {
        onNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, question, handleSelect, onNext]);

  return (
    <div className="w-full max-w-[640px] mx-auto">
      {/* 进度行 */}
      <div className="flex items-center justify-between mb-3 text-xs text-muted">
        <span className="font-semibold text-brand-500">{DRILL_KIND_LABEL[question.kind]}</span>
        <button
          onClick={() => speak(word.word, { rate: 0.9 })}
          className="inline-flex items-center gap-1.5 text-muted hover:text-ink transition-colors cursor-pointer"
          aria-label={`播放 ${word.word}`}
        >
          <Volume2 size={14} />
          再听一次
        </button>
      </div>

      {/* 题干 + 选项 */}
      <div className="bg-canvas border border-hairline rounded-2xl shadow-lift px-6 py-8 sm:px-10 text-center animate-fade-in">
        {question.kind === "listen2word" ? (
          <button
            onClick={() => speak(word.word, { rate: 0.9 })}
            className="mx-auto flex flex-col items-center justify-center w-20 h-20 rounded-full border border-hairline text-brand-500 hover:bg-coral-soft transition-colors cursor-pointer"
            aria-label="播放单词发音"
          >
            <Volume2 size={32} />
          </button>
        ) : (
          <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ink">
            {question.prompt}
          </div>
        )}
        {question.kind === "en2zh" && word.ipa && (
          <div className="text-sm text-muted mt-2 font-mono">{word.ipa}</div>
        )}
        {/* 新词首次出现带原句语境（§4.3；仅英→中——原句含答案，其余题型会泄底） */}
        {question.kind === "en2zh" && word.context_sentence && (
          <p className="text-[13px] text-muted leading-relaxed mt-5 max-w-[420px] mx-auto">
            <HighlightedSentence sentence={word.context_sentence} word={word.word} />
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-2.5 mt-7 text-left">
          {question.options.map((option, i) => {
            const isAnswer = option === question.answer;
            const isPicked = option === selected;
            return (
              <button
                key={option}
                disabled={answered}
                onClick={() => handleSelect(option)}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-3 rounded-xl border text-[15px] transition-colors text-left",
                  !answered &&
                    "border-hairline bg-canvas hover:border-brand-400 hover:bg-coral-soft cursor-pointer",
                  answered && isAnswer && "border-success bg-success-soft text-ink",
                  answered && isPicked && !isAnswer && "border-error bg-red-soft text-ink",
                  answered && !isAnswer && !isPicked && "border-hairline opacity-50"
                )}
              >
                <span className="w-5 h-5 rounded-md border border-hairline text-[11px] text-muted flex items-center justify-center flex-shrink-0 font-mono">
                  {i + 1}
                </span>
                <span className="flex-1">{option}</span>
              </button>
            );
          })}
        </div>

        {/* 作答反馈：对错 + 完整释义 + 原句（§4.2） */}
        {answered && (
          <div className="mt-6 pt-5 border-t border-hairline text-left animate-fade-slide-in">
            <p className={cn("text-sm font-bold", correct ? "text-success" : "text-error")}>
              {correct ? "答对了" : "答错了，正确答案已标出"}
            </p>
            {word.part_of_speech && (
              <p className="text-xs text-muted-soft italic mt-2">{word.part_of_speech}</p>
            )}
            <p className="text-[15px] text-ink font-medium leading-relaxed mt-1">
              {word.translation || word.definition || "—"}
            </p>
            {word.example_sentences && word.example_sentences.length > 0 && (
              <ul className="mt-3 space-y-1">
                {word.example_sentences.slice(0, 2).map((sentence, i) => (
                  <li key={i} className="text-[13px] text-muted leading-relaxed">
                    · {sentence}
                  </li>
                ))}
              </ul>
            )}
            {word.context_sentence && (
              <p className="text-[13px] text-muted leading-relaxed mt-3">
                原句：
                <HighlightedSentence sentence={word.context_sentence} word={word.word} />
              </p>
            )}
            {word.video_id && word.context_sentence && (
              <Link
                href={watchSentenceHref(
                  word.video_id,
                  { from: "drill" },
                  { subtitleId: word.subtitle_id, word: word.word }
                )}
                className="inline-flex items-center gap-1 mt-2 text-xs text-brand-500 hover:underline"
              >
                <ExternalLink size={12} />
                去原视频 →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* 下一个：必须手动点击才推进（§4.2） */}
      <Button size="lg" className="w-full mt-5" disabled={!answered} onClick={onNext}>
        下一个
        <ArrowRight size={16} className="ml-1" />
      </Button>
      <p className="text-center text-[11px] text-muted-soft mt-3">键盘 1-4 选择 · Enter 下一个</p>
    </div>
  );
}

/** 原句里高亮目标词（大小写不敏感的首个匹配，匹配不到就原样显示）。 */
function HighlightedSentence({ sentence, word }: { sentence: string; word: string }) {
  const idx = sentence.toLowerCase().indexOf(word.toLowerCase());
  if (idx < 0 || !word) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, idx)}
      <mark className="bg-coral-soft text-brand-700 rounded px-0.5 font-semibold">
        {sentence.slice(idx, idx + word.length)}
      </mark>
      {sentence.slice(idx + word.length)}
    </>
  );
}
