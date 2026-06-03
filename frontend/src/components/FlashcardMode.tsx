'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Volume2, RotateCcw, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';

interface Subtitle {
  id: string;
  text_en: string;
  text_zh: string | null;
}

interface FlashcardModeProps {
  subtitles: Subtitle[];
}

export default function FlashcardMode({ subtitles }: FlashcardModeProps) {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [shuffled, setShuffled] = useState<Subtitle[]>([]);

  useEffect(() => {
    setShuffled([...subtitles].sort(() => Math.random() - 0.5));
    setIndex(0);
    setShowAnswer(false);
    setFlipped(false);
  }, [subtitles]);

  const current = shuffled[index];
  if (!current) return null;

  function speak(text: string) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function next() {
    if (index < shuffled.length - 1) {
      setIndex(index + 1);
      setShowAnswer(false);
      setFlipped(false);
    }
  }

  function prev() {
    if (index > 0) {
      setIndex(index - 1);
      setShowAnswer(false);
      setFlipped(false);
    }
  }

  function shuffle() {
    setShuffled([...shuffled].sort(() => Math.random() - 0.5));
    setIndex(0);
    setShowAnswer(false);
    setFlipped(false);
  }

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-white/40">{index + 1} / {shuffled.length}</span>
        <button onClick={shuffle} className="text-white/40 hover:text-white text-xs flex items-center gap-1">
          <RotateCcw size={12} /> 打乱
        </button>
      </div>

      <div
        onClick={() => setFlipped(!flipped)}
        className="flex-1 flex items-center justify-center cursor-pointer"
      >
        <div className={cn(
          'w-full max-w-md aspect-[3/2] rounded-xl border border-white/10 bg-navy-elevated p-6 flex flex-col items-center justify-center text-center transition-all duration-300',
          flipped && 'bg-navy-soft'
        )}>
          {!flipped ? (
            <>
              <p className="text-lg leading-relaxed text-white font-medium">
                {current.text_en}
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); speak(current.text_en); }}
                className="mt-4 text-coral hover:text-coral-active"
              >
                <Volume2 size={20} />
              </button>
              <p className="mt-4 text-xs text-white/30">点击查看翻译</p>
            </>
          ) : (
            <>
              <p className="text-lg leading-relaxed text-white/80">
                {current.text_zh || '(无翻译)'}
              </p>
              <p className="mt-4 text-xs text-white/30">点击返回英文</p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 mt-4">
        <button onClick={prev} disabled={index === 0} className="text-white/50 hover:text-white disabled:opacity-30">
          <ChevronLeft size={24} />
        </button>
        <button onClick={next} disabled={index === shuffled.length - 1} className="text-white/50 hover:text-white disabled:opacity-30">
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
}
