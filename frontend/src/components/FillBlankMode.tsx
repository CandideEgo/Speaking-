'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Volume2, RotateCcw, Check, X } from 'lucide-react';

interface Subtitle {
  id: string;
  text_en: string;
  text_zh: string | null;
}

interface FillBlankModeProps {
  subtitle: Subtitle;
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

export default function FillBlankMode({ subtitle }: FillBlankModeProps) {
  const [blanks, setBlanks] = useState<string[]>([]);
  const [display, setDisplay] = useState('');
  const [answers, setAnswers] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    const { display: d, blanks: b } = generateBlanks(subtitle.text_en);
    setDisplay(d);
    setBlanks(b);
    setAnswers(new Array(b.length).fill(''));
    setChecked(false);
    setShowAnswer(false);
  }, [subtitle.id]);

  function speak() {
    const u = new SpeechSynthesisUtterance(subtitle.text_en);
    u.lang = 'en-US';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function check() {
    setChecked(true);
    setShowAnswer(true);
  }

  function reset() {
    const { display: d, blanks: b } = generateBlanks(subtitle.text_en);
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

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-white/40">填空模式</span>
        <button onClick={speak} className="flex items-center gap-1 text-coral hover:text-coral-active text-xs">
          <Volume2 size={14} /> 播放原句
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center max-w-lg">
          <p className="text-lg leading-relaxed text-white font-medium">
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
                        'w-24 px-2 py-1 rounded text-center text-sm bg-navy-soft border focus:outline-none transition-colors',
                        checked
                          ? answers[blankIndex]?.trim().toLowerCase() === blanks[blankIndex]?.toLowerCase()
                            ? 'border-green-500/50 text-green-400'
                            : 'border-red-500/50 text-red-400'
                          : 'border-white/20 focus:border-coral text-white'
                      )}
                    />
                  </span>
                );
              }
              return <span key={wi}>{word} </span>;
            })}
          </p>
          {subtitle.text_zh && (
            <p className="mt-4 text-sm text-white/50">{subtitle.text_zh}</p>
          )}
        </div>

        {showAnswer && (
          <div className="mt-6 text-center">
            <p className="text-xs text-white/40 mb-1">正确答案：</p>
            <p className="text-sm text-white/80">{blanks.join(', ')}</p>
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
            <div className={cn('flex items-center gap-1 text-sm', allCorrect ? 'text-green-400' : 'text-amber-400')}>
              {allCorrect ? <Check size={16} /> : <X size={16} />}
              {correctCount} / {blanks.length} 正确
            </div>
            <button onClick={reset} className="btn-secondary-dark !py-2 !px-4 text-xs">
              <RotateCcw size={14} /> 新题目
            </button>
          </>
        )}
      </div>
    </div>
  );
}
