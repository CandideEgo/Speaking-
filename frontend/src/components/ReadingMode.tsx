'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Volume2, Eye, EyeOff, Check, X } from 'lucide-react';

interface Subtitle {
  id: string;
  text_en: string;
  text_zh: string | null;
}

interface ReadingModeProps {
  subtitles: Subtitle[];
  selectedWord: string | null;
  onWordClick: (word: string) => void;
}

export default function ReadingMode({ subtitles, selectedWord, onWordClick }: ReadingModeProps) {
  const [showTranslation, setShowTranslation] = useState(true);
  const [readingIndex, setReadingIndex] = useState(0);

  const current = subtitles[readingIndex];
  if (!current) return null;

  function next() {
    if (readingIndex < subtitles.length - 1) setReadingIndex(readingIndex + 1);
  }

  function prev() {
    if (readingIndex > 0) setReadingIndex(readingIndex - 1);
  }

  function speak() {
    const u = new SpeechSynthesisUtterance(current.text_en);
    u.lang = 'en-US';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">{readingIndex + 1} / {subtitles.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTranslation(!showTranslation)} className="text-muted-foreground hover:text-ink">
            {showTranslation ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button onClick={speak} className="text-muted-foreground hover:text-coral">
            <Volume2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-lg">
          <p className="text-lg leading-relaxed text-ink font-medium">
            {current.text_en.split(' ').map((word, wi) => {
              const clean = word.replace(/[.,!?;:'"]/g, '');
              return (
                <span
                  key={wi}
                  onClick={() => onWordClick(word)}
                  className={cn(
                    'cursor-pointer rounded hover:bg-coral/20 transition-colors',
                    selectedWord === clean && 'bg-coral/30'
                  )}
                >
                  {word}{' '}
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
        <button onClick={prev} disabled={readingIndex === 0} className="btn-secondary !py-2 !px-4 text-xs disabled:opacity-30">
          上一句
        </button>
        <button onClick={next} disabled={readingIndex === subtitles.length - 1} className="btn-primary !py-2 !px-4 text-xs disabled:opacity-30">
          下一句
        </button>
      </div>
    </div>
  );
}