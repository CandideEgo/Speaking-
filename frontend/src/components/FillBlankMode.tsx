'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Volume2, RotateCcw, Check, X, Shuffle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Subtitle } from '@/types';
import { useSpeech } from '@/hooks/useSpeech';
import { useSentenceNavigation } from '@/hooks/useSentenceNavigation';

interface FillBlankModeProps {
  subtitles: Subtitle[];
}

function generateBlanks(text: string): { display: string; blanks: string[] } {
  const words = text.split(' ');
  const blanks: string[] = [];
  const importantWords = words.filter(w => w.length > 3 && !/^[A-Z]/.test(w));
  const numBlanks = Math.min(3, Math.max(1, Math.floor(importantWords.length * 0.3)));

  const selectedIndices = new Set<number>();
  const importantIndices = words.map((w, i) => importantWords.includes(w) ? i : -1).filter(i => i >= 0);

  while (selectedIndices.size < numBlanks && selectedIndices.size < importantIndices.length) {
    const rand = importantIndices[Math.floor(Math.random() * importantIndices.length)];
    selectedIndices.add(rand);
  }

  const display = words.map((w, i) => {
    if (selectedIndices.has(i)) {
      blanks.push(w.replace(/[.,!?;:'"]/g, ''));
      return '______';
    }
    return w;
  }).join(' ');

  return { display, blanks };
}

export default function FillBlankMode({ subtitles }: FillBlankModeProps) {
  const [blanks, setBlanks] = useState<string[]>([]);
  const [display, setDisplay] = useState('');
  const [answers, setAnswers] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  const { speak } = useSpeech();

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
  });

  const current = subtitles[selectedIndex];

  useEffect(() => {
    if (current) {
      const { display: d, blanks: b } = generateBlanks(current.text_en);
      setDisplay(d);
      setBlanks(b);
      setAnswers(new Array(b.length).fill(''));
      setChecked(false);
      setShowAnswer(false);
    }
  }, [selectedIndex, current?.id]);

  function handleSpeak() {
    if (!current) return;
    speak(current.text_en, { rate: 1 });
  }

  function check() {
    setChecked(true);
    setShowAnswer(true);
  }

  function reset() {
    if (!current) return;
    const { display: d, blanks: b } = generateBlanks(current.text_en);
    setDisplay(d);
    setBlanks(b);
    setAnswers(new Array(b.length).fill(''));
    setChecked(false);
    setShowAnswer(false);
  }

  const correctCount = blanks.filter((b, i) =>
    answers[i]?.trim().toLowerCase() === b.toLowerCase()
  ).length;
  const allCorrect = correctCount === blanks.length;

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

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">填空模式</span>
        <button onClick={handleSpeak} className="flex items-center gap-1 text-coral hover:text-coral-active text-xs">
          <Volume2 size={14} /> 播放原句
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center max-w-lg">
          <p className="text-lg leading-relaxed text-ink font-medium">
            {display.split(' ').map((word, wi) => {
              if (word.startsWith('____')) {
                const blankIndex = display.split(' ').slice(0, wi).filter(w => w.startsWith('____')).length;
                return (
                  <span key={wi} className="inline-block mx-1">
                    <input
                      type="text"
                      value={answers[blankIndex] || ''}
                      onChange={(e) => {
                        const newAnswers = [...answers];
                        newAnswers[blankIndex] = e.target.value;
                        setAnswers(newAnswers);
                      }}
                      disabled={checked}
                      className={cn(
                        'w-24 px-2 py-1 rounded text-center text-sm bg-cream-card border focus:outline-none transition-colors',
                        checked
                          ? answers[blankIndex]?.trim().toLowerCase() === blanks[blankIndex]?.toLowerCase()
                            ? 'border-learn-correct/50 text-learn-correct'
                            : 'border-learn-wrong/50 text-learn-wrong'
                          : 'border-hairline focus:border-coral text-ink'
                      )}
                    />
                  </span>
                );
              }
              return <span key={wi}>{word} </span>;
            })}
          </p>
          {current.text_zh && (
            <p className="mt-4 text-sm text-muted-foreground">{current.text_zh}</p>
          )}
        </div>

        {showAnswer && (
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground mb-1">正确答案：</p>
            <p className="text-sm text-ink/75">{blanks.join(', ')}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 mt-4">
        {!checked ? (
          <button onClick={check} disabled={answers.some(a => !a.trim())} className="btn-primary !py-2 !px-6 text-xs disabled:opacity-30">
            检查
          </button>
        ) : (
          <>
            <div className={cn('flex items-center gap-1 text-sm', allCorrect ? 'text-learn-correct' : 'text-coral')}>
              {allCorrect ? <Check size={16} /> : <X size={16} />}
              {correctCount} / {blanks.length} 正确
            </div>
            <button onClick={reset} className="btn-secondary !py-2 !px-4 text-xs">
              <RotateCcw size={14} /> 新题目
            </button>
          </>
        )}
      </div>
    </div>
  );
}
