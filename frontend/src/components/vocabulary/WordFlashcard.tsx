"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSpeech } from "@/hooks/useSpeech";
import { vocabularySource, partOfSpeechLabel } from "@/lib/vocabularyPresentation";
import { DictionaryMeaning } from "@/components/vocabulary/DictionaryMeaning";
import { cn } from "@/lib/utils";
import { DRILL_KIND_LABEL, type DrillQuestion } from "@/lib/drillQuestions";
import { Card } from "@/components/ui/Card";
import { HighlightedSentence } from "@/components/vocabulary/HighlightedSentence";

/**
 * 选择题卡（S5，设计文档 §4）：全程选择题取代旧的自评双按钮闪卡。
 * 三种题型共用一张卡：英→中（认词）、中→英（巩固）、听音选词（§4.4）。
 *
 * 排版按题型分档，三种题面不共用一档字号：
 * - 英→中：题面是单词（短）→ 4xl/5xl 大字 + 音标；
 * - 中→英：题面是释义（长、可能换行）→ 20~26px，`text-balance` 折行；
 * - 听音选词：题面只有音频 → 80px 圆钮 + 一句提示。
 * 「再听一次」只在前两种题型出现——听音题的题面本身就是那个播放钮。
 *
 * 作答反馈（§4.2）：标对错（红/绿 + 对错图标，不只靠颜色）→ 展开完整释义 →
 * 有原句时显示原句 + 「去原视频」→ 卡内「下一个」必须手动点击才推进。
 * 反馈块一律先亮出「单词 + 音标 + 词性 + 释义」：中→英与听音选的题面里本来
 * 就没有单词本身，不补这一行，答完也无从核对拼写与读音。
 * 新词首次出现（英→中）题干带原句语境，可从语境推断词义（§4.3）。
 */
export function WordQuizCard({
  question,
  onAnswer,
  onNext,
  onSkip,
  onExit,
}: {
  question: DrillQuestion;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
  /** 跳过当前词（记为未答对、稍后再问），设计 drill 会话的「跳过」。 */
  onSkip?: () => void;
  /** Esc 退出训练（设计 drill 会话的「Esc 退出训练」）。 */
  onExit?: () => void;
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
      if (e.key === "Escape" && onExit) {
        e.preventDefault();
        onExit();
        return;
      }
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
  }, [selected, question, handleSelect, onNext, onExit]);

  return (
    <div className="w-full max-w-[640px] mx-auto">
      <Card padding={0} className="shadow-lift px-6 py-7 sm:px-8 animate-fade-in">
        {/* 眉标：题型 + 重听（听音题的题面就是播放钮，不重复摆一个） */}
        <div className="flex items-center justify-between gap-3 text-caption">
          <span className="font-semibold text-brand-700">{DRILL_KIND_LABEL[question.kind]}</span>
          {question.kind !== "listen2word" && (
            <button
              type="button"
              onClick={() => speak(word.word, { rate: 0.9 })}
              className="inline-flex items-center gap-1.5 text-muted hover:text-ink transition-colors cursor-pointer"
              aria-label={`播放 ${word.word}`}
            >
              <Volume2 size={13} />
              再听一次
            </button>
          )}
        </div>

        {/* 题面 */}
        <div className="flex flex-col items-center justify-center text-center min-h-[104px] mt-5">
          {question.kind === "listen2word" ? (
            <>
              <button
                type="button"
                onClick={() => speak(word.word, { rate: 0.9 })}
                className="flex items-center justify-center w-20 h-20 rounded-full border border-hairline text-brand-700 hover:bg-brand-50 transition-colors cursor-pointer"
                aria-label="播放单词发音"
              >
                <Volume2 size={32} />
              </button>
              <p className="text-meta text-muted mt-3">听发音，选出你听到的词</p>
            </>
          ) : question.kind === "zh2en" ? (
            <p className="text-title sm:text-display-sm font-bold text-ink leading-snug text-balance max-w-[26rem]">
              {question.prompt}
            </p>
          ) : (
            <>
              <p className="display-xl text-ink">{question.prompt}</p>
              {word.ipa && <p className="text-copy text-muted mt-2 font-mono">{word.ipa}</p>}
            </>
          )}

          {/* 新词首次出现带原句语境（§4.3；仅英→中——原句含答案，其余题型会泄底） */}
          {question.kind === "en2zh" && word.context_sentence && (
            <p className="text-copy text-muted leading-relaxed mt-5 max-w-[440px]">
              <HighlightedSentence sentence={word.context_sentence} word={word.word} />
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-2 mt-6 text-left">
          {question.options.map((option, i) => {
            const isAnswer = option === question.answer;
            const isPicked = option === selected;
            return (
              <button
                key={option}
                type="button"
                disabled={answered}
                onClick={() => handleSelect(option)}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 py-3 rounded-md border text-copy transition-colors text-left",
                  !answered &&
                    "border-hairline bg-canvas hover:border-brand-400 hover:bg-brand-50 cursor-pointer",
                  answered && isAnswer && "border-success bg-success-soft text-ink",
                  answered && isPicked && !isAnswer && "border-error bg-red-soft text-ink",
                  answered && !isAnswer && !isPicked && "border-hairline opacity-50"
                )}
              >
                <span className="w-5 h-5 rounded-sm border border-hairline text-caption text-muted flex items-center justify-center flex-shrink-0 font-mono">
                  {i + 1}
                </span>
                <span className="flex-1">{option}</span>
                {/* 对错不只靠颜色：色觉障碍下同样要能分辨 */}
                {answered && isAnswer && <Check size={15} className="text-success flex-shrink-0" />}
                {answered && isPicked && !isAnswer && (
                  <X size={15} className="text-error flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* 作答反馈：对错 + 词头（单词/音标/词性）+ 完整释义 + 原句（§4.2） */}
        {answered && (
          <div className="mt-5 pt-5 border-t border-hairline text-left animate-fade-slide-in">
            <p
              className={cn(
                "flex items-center gap-1.5 text-copy font-bold",
                correct ? "text-success-text" : "text-error-text"
              )}
            >
              {correct ? <Check size={15} /> : <X size={15} />}
              {correct ? "答对了" : "答错了，正确答案已标出"}
            </p>
            <div className="flex items-baseline gap-2 flex-wrap mt-3">
              <span className="text-copy-lg font-bold text-ink">{word.word}</span>
              {word.ipa && <span className="text-meta text-muted font-mono">{word.ipa}</span>}
              {word.part_of_speech && (
                <span className="text-meta text-muted italic">
                  {partOfSpeechLabel(word.part_of_speech)}
                </span>
              )}
            </div>
            <DictionaryMeaning
              translation={word.translation}
              definition={word.definition}
              partOfSpeech={word.part_of_speech}
            />
            {word.example_sentences && word.example_sentences.length > 0 && (
              <ul className="mt-3 space-y-1">
                {word.example_sentences.slice(0, 2).map((sentence, i) => (
                  <li key={i} className="text-copy text-muted leading-relaxed">
                    · {sentence}
                  </li>
                ))}
              </ul>
            )}
            {word.context_sentence && (
              <p className="text-copy text-muted leading-relaxed mt-3">
                原句：
                <HighlightedSentence sentence={word.context_sentence} word={word.word} />
              </p>
            )}
            {word.video_id && word.context_sentence && (
              <Link
                href={vocabularySource(word, "drill")!.href}
                className="inline-flex items-center gap-1 mt-2 text-meta text-brand-700 hover:underline"
              >
                <ExternalLink size={12} />
                {vocabularySource(word, "drill")!.label}
              </Link>
            )}
          </div>
        )}

        {/* 跳过 / 下一个：设计 drill 会话的卡内两枚动作。下一个必须手动点击才推进（§4.2）；
            跳过按「未答对」处理（稍后还会再问一次），不必等作答。 */}
        <div className="mt-6 flex items-center gap-3">
          {onSkip && (
            <Button variant="text" size="md" onClick={onSkip}>
              跳过
            </Button>
          )}
          <Button size="lg" className="flex-1" disabled={!answered} onClick={onNext}>
            下一个
            <ArrowRight size={16} className="ml-1" />
          </Button>
        </div>
        <p className="text-center text-caption text-muted mt-3">
          键盘 1-4 选择 · Enter 下一个 · Esc 退出训练
        </p>
      </Card>
    </div>
  );
}
