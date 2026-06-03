'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { Mic, Play, Copy, Heart, Edit3, Check } from 'lucide-react';

interface Subtitle {
  id: string;
  start_time: number;
  end_time: number;
  text_en: string;
  text_zh: string | null;
  grammar_note?: string | null;
}

interface SubtitleListProps {
  subtitles: Subtitle[];
  currentIndex: number;
  showEnglishOnly: boolean;
  selectedWord: string | null;
  onSubtitleClick: (index: number, startTime: number) => void;
  onWordClick: (word: string) => void;
  onStartSpeaking: (subtitleId: string) => void;
}

export default function SubtitleList({
  subtitles,
  currentIndex,
  showEnglishOnly,
  selectedWord,
  onSubtitleClick,
  onWordClick,
  onStartSpeaking,
}: SubtitleListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());

  async function handleCopy(subtitleId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(subtitleId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  function handleFavorite(subtitleId: string) {
    setFavorited((prev) => {
      const next = new Set(prev);
      if (next.has(subtitleId)) {
        next.delete(subtitleId);
      } else {
        next.add(subtitleId);
      }
      return next;
    });
  }

  return (
    <div className="divide-y divide-white/5">
      {subtitles.map((sub, i) => {
        const isActive = i === currentIndex;
        return (
          <div
            key={sub.id}
            id={`subtitle-${i}`}
            className={cn(
              'group relative transition-colors',
              isActive && 'bg-coral/10 border-l-2 border-l-coral'
            )}
          >
            <button
              onClick={() => onSubtitleClick(i, sub.start_time)}
              className="w-full px-4 py-3 text-left hover:bg-white/5"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-white/30">{formatTime(sub.start_time)}</p>
                {/* Action buttons - visible on hover or when active */}
                <div
                  className={cn(
                    'flex items-center gap-1 transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSubtitleClick(i, sub.start_time);
                    }}
                    className="p-1 rounded text-white/40 hover:text-coral hover:bg-white/5 transition-colors"
                    title="播放"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(sub.id, sub.text_en);
                    }}
                    className="p-1 rounded text-white/40 hover:text-coral hover:bg-white/5 transition-colors"
                    title="复制"
                  >
                    {copiedId === sub.id ? (
                      <Check size={12} className="text-green-400" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFavorite(sub.id);
                    }}
                    className={cn(
                      'p-1 rounded transition-colors',
                      favorited.has(sub.id)
                        ? 'text-coral hover:text-coral/80'
                        : 'text-white/40 hover:text-coral hover:bg-white/5'
                    )}
                    title="收藏"
                  >
                    <Heart size={12} className={favorited.has(sub.id) ? 'fill-current' : ''} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Implement edit functionality
                    }}
                    className="p-1 rounded text-white/40 hover:text-coral hover:bg-white/5 transition-colors"
                    title="编辑"
                  >
                    <Edit3 size={12} />
                  </button>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-white/80">
                {sub.text_en.split(' ').map((word, wi) => {
                  const cleanWord = word.replace(/[.,!?;:'"]/g, '');
                  return (
                    <span
                      key={wi}
                      onClick={(e) => {
                        e.stopPropagation();
                        onWordClick(word);
                      }}
                      className={cn(
                        'cursor-pointer rounded hover:bg-coral/20 transition-colors',
                        selectedWord === cleanWord && 'bg-coral/30'
                      )}
                    >
                      {word}{' '}
                    </span>
                  );
                })}
              </p>
              {!showEnglishOnly && sub.text_zh && (
                <p className="mt-1 text-sm text-white/40">{sub.text_zh}</p>
              )}
              {sub.grammar_note && (
                <p className="mt-1 text-xs text-amber-400/80">提示：{sub.grammar_note}</p>
              )}
            </button>
            <div className="px-4 pb-2">
              <button
                onClick={() => onStartSpeaking(sub.id)}
                className="inline-flex items-center gap-1 text-xs text-coral hover:underline"
              >
                <Mic size={12} /> 练习这句
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
