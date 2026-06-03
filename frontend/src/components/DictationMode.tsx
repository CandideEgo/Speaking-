'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Volume2, RotateCcw, Check, X } from 'lucide-react';

interface Subtitle {
  id: string;
  text_en: string;
  text_zh: string | null;
}

interface DictationModeProps {
  subtitle: Subtitle;
}

export default function DictationMode({ subtitle }: DictationModeProps) {
  const [input, setInput] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [checked, setChecked] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setInput('');
    setShowAnswer(false);
    setChecked(false);
    inputRef.current?.focus();
  }, [subtitle.id]);

  function speak() {
    const u = new SpeechSynthesisUtterance(subtitle.text_en);
    u.lang = 'en-US';
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
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
  const normalizedAnswer = subtitle.text_en.trim().toLowerCase().replace(/[.,!?;:'"]/g, '');
  const isCorrect = normalizedInput === normalizedAnswer;

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-white/40">听写模式</span>
        <button onClick={speak} className="flex items-center gap-1 text-coral hover:text-coral-active text-xs">
          <Volume2 size={14} /> 播放
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="写下你听到的内容..."
          disabled={checked}
          className={cn(
            'w-full max-w-lg h-32 rounded-lg border bg-navy-soft px-4 py-3 text-white text-sm resize-none focus:outline-none transition-colors',
            checked
              ? isCorrect
                ? 'border-green-500/50 bg-green-500/5'
                : 'border-red-500/50 bg-red-500/5'
              : 'border-white/10 focus:border-coral'
          )}
        />

        {showAnswer && (
          <div className="mt-4 text-center max-w-lg">
            <p className="text-xs text-white/40 mb-1">正确答案：</p>
            <p className="text-sm text-white/80">{subtitle.text_en}</p>
            {subtitle.text_zh && (
              <p className="mt-2 text-xs text-white/50">{subtitle.text_zh}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 mt-4">
        {!checked ? (
          <button onClick={check} disabled={!input.trim()} className="btn-primary !py-2 !px-6 text-xs disabled:opacity-30">
            检查
          </button>
        ) : (
          <>
            <div className={cn('flex items-center gap-1 text-sm', isCorrect ? 'text-green-400' : 'text-red-400')}>
              {isCorrect ? <Check size={16} /> : <X size={16} />}
              {isCorrect ? '正确！' : '再试一次'}
            </div>
            <button onClick={reset} className="btn-secondary-dark !py-2 !px-4 text-xs">
              <RotateCcw size={14} /> 重试
            </button>
          </>
        )}
      </div>
    </div>
  );
}
