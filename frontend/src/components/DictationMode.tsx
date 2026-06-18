'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Volume2, RotateCcw, Check, X, Shuffle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Subtitle } from '@/types';
import { useSpeech } from '@/hooks/useSpeech';
import { useSentenceNavigation } from '@/hooks/useSentenceNavigation';

interface DictationModeProps {
  subtitles: Subtitle[];
}

export default function DictationMode({ subtitles }: DictationModeProps) {
  const [input, setInput] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [checked, setChecked] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { isPlaying, speak, stop: stopSpeaking } = useSpeech({ rate: 0.9 });

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
      setInput('');
      setShowAnswer(false);
      setChecked(false);
      inputRef.current?.focus();
    },
  });

  const current = subtitles[selectedIndex];

  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedIndex]);

  function handleSpeak(text?: string) {
    const textToSpeak = text || current?.text_en;
    if (!textToSpeak) return;
    speak(textToSpeak);
  }

  function check() {
    setChecked(true);
    setShowAnswer(true);
  }

  function reset() {
    setInput('');
    setShowAnswer(false);
    setChecked(false);
    inputRef.current?.focus();
  }

  const normalizedInput = input.trim().toLowerCase().replace(/[.,!?;:'"]/g, '');
  const normalizedAnswer = current?.text_en.trim().toLowerCase().replace(/[.,!?;:'"]/g, '') || '';
  const isCorrect = normalizedInput === normalizedAnswer && normalizedInput.length > 0;

  // Generate diff for error highlighting
  function getDiff() {
    if (!checked || isCorrect) return null;
    const inputWords = input.trim().split(/\s+/);
    const answerWords = current?.text_en.trim().split(/\s+/) || [];
    return { inputWords, answerWords };
  }

  const diff = getDiff();

  if (!current) return null;

  return (
    <div className="flex flex-col h-full p-4">
      {/* Sentence selector */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={prevSentence} disabled={isFirst} className="text-muted-foreground hover:text-ink disabled:opacity-30" aria-label="上一句">
          <ChevronLeft size={20} />
        </button>
        <select
          value={selectedIndex}
          onChange={(e) => goToSentence(Number(e.target.value))}
          className="flex-1 min-w-0 text-sm bg-cream-card border border-hairline rounded-lg px-3 py-2 text-ink focus:border-coral focus:outline-none"
        >
          {subtitles.map((sub, i) => (
            <option key={sub.id} value={i}>
              {i + 1}. {sub.text_en.slice(0, 50)}{sub.text_en.length > 50 ? '...' : ''}
            </option>
          ))}
        </select>
        <button onClick={nextSentence} disabled={isLast} className="text-muted-foreground hover:text-ink disabled:opacity-30" aria-label="下一句">
          <ChevronRight size={20} />
        </button>
        <button onClick={randomSentence} className="btn-secondary !py-1.5 !px-2 text-xs" title="随机选择" aria-label="随机选择">
          <Shuffle size={14} />
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">听写模式</span>
        <div className="flex items-center gap-2">
          {isPlaying ? (
            <button onClick={stopSpeaking} className="flex items-center gap-1 text-coral hover:text-coral-active text-xs">
              <Volume2 size={14} /> 停止
            </button>
          ) : (
            <button onClick={() => handleSpeak()} className="flex items-center gap-1 text-coral hover:text-coral-active text-xs">
              <Volume2 size={14} /> 播放
            </button>
          )}
          <button onClick={() => handleSpeak()} disabled={isPlaying} className="flex items-center gap-1 text-muted-foreground hover:text-ink text-xs disabled:opacity-30">
            <RotateCcw size={14} /> 重播
          </button>
        </div>
      </div>

      {/* Input area */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="写下你听到的内容..."
          disabled={checked}
          className={cn(
            'w-full max-w-lg h-32 rounded-lg border bg-cream-card px-4 py-3 text-ink text-sm resize-none focus:outline-none transition-colors',
            checked
              ? isCorrect
                ? 'border-learn-correct/50 bg-learn-correct/5'
                : 'border-learn-wrong/50 bg-learn-wrong/5'
              : 'border-hairline focus:border-coral'
          )}
        />

        {/* Answer display */}
        {showAnswer && (
          <div className="mt-4 text-center max-w-lg w-full">
            <p className="text-xs text-muted-foreground mb-1">正确答案：</p>
            <p className="text-sm text-ink/75">{current.text_en}</p>
            {current.text_zh && (
              <p className="mt-2 text-xs text-muted-foreground">{current.text_zh}</p>
            )}

            {/* Error diff */}
            {diff && (
              <div className="mt-3 text-left">
                <p className="text-xs text-muted-foreground mb-1">差异对比：</p>
                <div className="text-sm">
                  <p className="text-learn-wrong line-through">{input.trim()}</p>
                  <p className="text-learn-correct">{current.text_en}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3 mt-4">
        {!checked ? (
          <button onClick={check} disabled={!input.trim()} className="btn-primary !py-2 !px-6 text-xs disabled:opacity-30">
            提交并验错
          </button>
        ) : (
          <>
            <div className={cn('flex items-center gap-1 text-sm', isCorrect ? 'text-learn-correct' : 'text-learn-wrong')}>
              {isCorrect ? <Check size={16} /> : <X size={16} />}
              {isCorrect ? '正确！' : '再试一次'}
            </div>
            <button onClick={reset} className="btn-secondary !py-2 !px-4 text-xs">
              <RotateCcw size={14} /> 重试
            </button>
          </>
        )}
      </div>
    </div>
  );
}
