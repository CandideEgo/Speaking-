"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, Check, X, Shuffle, ChevronLeft, ChevronRight } from "lucide-react";
import type { Subtitle } from "@/types";
import { useSentenceNavigation } from "@/hooks/useSentenceNavigation";

interface TranslateModeProps {
  subtitles: Subtitle[];
}

export default function TranslateMode({ subtitles }: TranslateModeProps) {
  const [input, setInput] = useState("");
  const [checked, setChecked] = useState(false);
  const [direction, setDirection] = useState<"en-zh" | "zh-en">("en-zh");

  const {
    selectedIndex,
    goToSentence,
    nextSentence,
    prevSentence,
    randomSentence,
    isFirst,
    isLast,
  } = useSentenceNavigation({
    totalSentences: subtitles.length,
    onChange: () => {
      setInput("");
      setChecked(false);
    },
  });

  const current = subtitles[selectedIndex];
  if (!current || !current.text_zh)
    return <div className="p-4 text-center text-muted-foreground">此视频没有中文翻译</div>;

  function check() {
    setChecked(true);
  }

  function next() {
    if (!isLast) {
      goToSentence(selectedIndex + 1);
    }
  }

  function toggleDirection() {
    setDirection((d) => (d === "en-zh" ? "zh-en" : "en-zh"));
    setInput("");
    setChecked(false);
  }

  const source = direction === "en-zh" ? current.text_en : current.text_zh;
  const target = direction === "en-zh" ? current.text_zh : current.text_en;

  const normalizedInput = input.trim().toLowerCase();
  const normalizedTarget = target.trim().toLowerCase();
  const isCorrect = normalizedInput === normalizedTarget;

  return (
    <div className="flex flex-col h-full p-4">
      {/* Sentence selector */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={prevSentence}
          disabled={isFirst}
          className="text-muted-foreground hover:text-ink disabled:opacity-30"
          aria-label="上一句"
        >
          <ChevronLeft size={20} />
        </button>
        <select
          value={selectedIndex}
          onChange={(e) => goToSentence(Number(e.target.value))}
          className="flex-1 min-w-0 text-sm bg-cream-card border border-hairline rounded-lg px-3 py-2 text-ink focus:border-coral focus:outline-none"
        >
          {subtitles.map((sub, i) => (
            <option key={sub.id} value={i}>
              {i + 1}. {sub.text_en.slice(0, 50)}
              {sub.text_en.length > 50 ? "..." : ""}
            </option>
          ))}
        </select>
        <button
          onClick={nextSentence}
          disabled={isLast}
          className="text-muted-foreground hover:text-ink disabled:opacity-30"
          aria-label="下一句"
        >
          <ChevronRight size={20} />
        </button>
        <button
          onClick={randomSentence}
          className="btn-secondary !py-1.5 !px-2 text-xs"
          title="随机选择"
          aria-label="随机选择"
        >
          <Shuffle size={14} />
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">
          {selectedIndex + 1} / {subtitles.length}
        </span>
        <button
          onClick={toggleDirection}
          className="flex items-center gap-1 text-xs text-coral hover:text-coral-active"
        >
          <ArrowRightLeft size={14} />
          {direction === "en-zh" ? "英→中" : "中→英"}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center max-w-lg mb-6">
          <p className="text-xs text-muted-foreground mb-2">翻译以下内容：</p>
          <p className="text-lg leading-relaxed text-ink font-medium">{source}</p>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={direction === "en-zh" ? "输入中文翻译..." : "输入英文翻译..."}
          disabled={checked}
          className={cn(
            "w-full max-w-lg h-24 rounded-lg border bg-cream-card px-4 py-3 text-ink text-sm resize-none focus:outline-none transition-colors",
            checked
              ? isCorrect
                ? "border-learn-correct/50 bg-learn-correct/5"
                : "border-learn-wrong/50 bg-learn-wrong/5"
              : "border-hairline focus:border-coral"
          )}
        />

        {checked && (
          <div className="mt-4 text-center max-w-lg">
            <p className="text-xs text-muted-foreground mb-1">参考翻译：</p>
            <p className="text-sm text-ink/75">{target}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 mt-4">
        {!checked ? (
          <button
            onClick={check}
            disabled={!input.trim()}
            className="btn-primary !py-2 !px-6 text-xs disabled:opacity-30"
          >
            检查
          </button>
        ) : (
          <>
            <div
              className={cn(
                "flex items-center gap-1 text-sm",
                isCorrect ? "text-learn-correct" : "text-coral"
              )}
            >
              {isCorrect ? <Check size={16} /> : <X size={16} />}
              {isCorrect ? "很好！" : "继续加油"}
            </div>
            <button onClick={next} className="btn-primary !py-2 !px-4 text-xs">
              下一句
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 mt-2">
        <button
          onClick={prevSentence}
          disabled={isFirst}
          className="text-xs text-muted-foreground hover:text-ink disabled:opacity-30"
        >
          上一句
        </button>
        <button
          onClick={nextSentence}
          disabled={isLast}
          className="text-xs text-muted-foreground hover:text-ink disabled:opacity-30"
        >
          跳过
        </button>
      </div>
    </div>
  );
}
