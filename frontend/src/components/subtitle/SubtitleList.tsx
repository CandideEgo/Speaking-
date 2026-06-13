'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { Mic, Play, Copy, Heart, Edit3, Check } from 'lucide-react';

import { useWatchStore } from '@/stores/watchStore';

interface Subtitle {
  id: string;
  start_time: number;
  end_time: number;
  text_en: string;
  text_zh: string | null;
  grammar_note?: string | null;
  difficulty_words?: string | null;
  speaker?: string | null;
}

interface SubtitleListProps {
  subtitles: Subtitle[];
  currentIndex: number;
  selectedWord: string | null;
  onSubtitleClick: (index: number, startTime: number) => void;
  onWordClick: (word: string) => void;
  onStartSpeaking: (subtitleId: string) => void;
}

/** Parse difficulty_words JSON string into array of words to highlight */
function parseDifficultyWords(difficultyWords: string | null | undefined): string[] {
  if (!difficultyWords) return [];
  try {
    const parsed = JSON.parse(difficultyWords);
    if (Array.isArray(parsed)) return parsed.map((w: unknown) => String(w).toLowerCase());
    return [];
  } catch {
    return [];
  }
}

/** Generate mock phonetic transcription from English text */
function generatePhonetic(text: string): string {
  // Simple mock: just show the text with phonetic-like formatting
  // In production, this would come from the backend
  const words = text.split(' ').slice(0, 6);
  return words.map(() => '·').join(' ');
}

/** Generate color for speaker avatar based on name */
function getSpeakerColor(name: string): string {
  const colors = [
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-green-100 text-green-700 border-green-200',
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-orange-100 text-orange-700 border-orange-200',
    'bg-pink-100 text-pink-700 border-pink-200',
    'bg-teal-100 text-teal-700 border-teal-200',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-rose-100 text-rose-700 border-rose-200',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Get initials from speaker name */
function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

/** Group subtitles by speaker */
function groupSubtitlesBySpeaker(subtitles: Subtitle[]): { speaker: string | null; subtitles: Subtitle[]; startIndex: number }[] {
  const groups: { speaker: string | null; subtitles: Subtitle[]; startIndex: number }[] = [];

  for (let i = 0; i < subtitles.length; i++) {
    const sub = subtitles[i];
    const speaker = sub.speaker || null;

    if (groups.length === 0 || groups[groups.length - 1].speaker !== speaker) {
      groups.push({ speaker, subtitles: [sub], startIndex: i });
    } else {
      groups[groups.length - 1].subtitles.push(sub);
    }
  }

  return groups;
}
function HighlightedText({
  text,
  highlightWords,
  selectedWord,
  onWordClick,
}: {
  text: string;
  highlightWords: string[];
  selectedWord: string | null;
  onWordClick: (word: string) => void;
}) {
  const words = text.split(/(\s+)/);

  return (
    <span className="text-[15px] leading-relaxed text-ink/90">
      {words.map((word, wi) => {
        if (/^\s+$/.test(word)) {
          return <span key={wi}>{word}</span>;
        }
        const cleanWord = word.replace(/[.,!?;:'"()\[\]]/g, '').toLowerCase();
        const isHighlighted = highlightWords.includes(cleanWord);
        const isSelected = selectedWord === cleanWord;

        return (
          <span
            key={wi}
            onClick={(e) => {
              e.stopPropagation();
              onWordClick(word);
            }}
            className={cn(
              'cursor-pointer rounded transition-colors duration-150',
              isHighlighted && 'bg-red-100 text-red-700 px-0.5',
              isSelected && 'bg-coral/20 text-coral',
              !isHighlighted && !isSelected && 'hover:bg-coral/10'
            )}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}

export default function SubtitleList({
  subtitles,
  currentIndex,
  selectedWord,
  onSubtitleClick,
  onWordClick,
  onStartSpeaking,
}: SubtitleListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());
  const { subtitleMode } = useWatchStore();
  const showEnglishOnly = subtitleMode === 'english';

  const handleCopy = useCallback(async (subtitleId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(subtitleId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API not available
    }
  }, []);

  const handleFavorite = useCallback((subtitleId: string) => {
    setFavorited((prev) => {
      const next = new Set(prev);
      if (next.has(subtitleId)) {
        next.delete(subtitleId);
      } else {
        next.add(subtitleId);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-2 p-3">
      {groupSubtitlesBySpeaker(subtitles).map((group, groupIdx) => {
        const speaker = group.speaker;
        const speakerColor = speaker ? getSpeakerColor(speaker) : '';

        return (
          <div key={groupIdx} className="flex flex-col gap-1">
            {/* Speaker header */}
            {speaker && (
              <div className="flex items-center gap-2 px-2 py-1">
                <div className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border',
                  speakerColor
                )}>
                  {getInitials(speaker)}
                </div>
                <span className="text-sm font-medium text-ink/80">
                  {speaker}
                </span>
              </div>
            )}

            {/* Subtitles in this group */}
            {group.subtitles.map((sub) => {
              const i = subtitles.indexOf(sub);
              const isActive = i === currentIndex;
              const highlightWords = useMemo(() => parseDifficultyWords(sub.difficulty_words), [sub.difficulty_words]);

              return (
                <div
                  key={sub.id}
                  id={`subtitle-${i}`}
                  className={cn(
                    'group relative rounded-xl transition-all duration-200',
                    isActive
                      ? 'bg-cream-card shadow-sm border border-coral/30'
                      : 'hover:bg-cream-soft/50'
                  )}
                >
                  {/* Main content area */}
                  <button
                    onClick={() => onSubtitleClick(i, sub.start_time)}
                    className="w-full text-left px-4 py-3"
                  >
                    {/* Phonetic / IPA line */}
                    <p className="text-[13px] text-muted-foreground font-mono italic mb-1.5">
                      {generatePhonetic(sub.text_en)}
                    </p>

                    {/* English text with highlighted words */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <HighlightedText
                          text={sub.text_en}
                          highlightWords={highlightWords}
                          selectedWord={selectedWord}
                          onWordClick={onWordClick}
                        />
                      </div>
                    </div>

                    {/* Chinese translation */}
                    {!showEnglishOnly && sub.text_zh && (
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {sub.text_zh}
                      </p>
                    )}

                    {/* Grammar note */}
                    {sub.grammar_note && (
                      <p className="mt-1.5 text-xs text-amber-600/80">
                        提示：{sub.grammar_note}
                      </p>
                    )}
                  </button>

                  {/* Bottom action bar: timestamp + action buttons */}
                  <div className="flex items-center justify-between px-4 pb-3">
                    {/* Timestamp and index */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {i + 1}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {formatTime(sub.start_time)} - {formatTime(sub.end_time)}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSubtitleClick(i, sub.start_time);
                        }}
                        className="p-1.5 rounded-lg text-ink/70 hover:text-coral hover:bg-coral/10 transition-colors"
                        title="播放"
                      >
                        <Play size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(sub.id, sub.text_en);
                        }}
                        className="p-1.5 rounded-lg text-ink/70 hover:text-coral hover:bg-coral/10 transition-colors"
                        title="复制"
                      >
                        {copiedId === sub.id ? (
                          <Check size={14} className="text-green-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFavorite(sub.id);
                        }}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          favorited.has(sub.id)
                            ? 'text-coral bg-coral/10'
                            : 'text-ink/70 hover:text-coral hover:bg-coral/10'
                        )}
                        title="收藏"
                      >
                        <Heart
                          size={14}
                          className={favorited.has(sub.id) ? 'fill-current' : ''}
                        />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implement edit functionality
                        }}
                        className="p-1.5 rounded-lg text-ink/70 hover:text-coral hover:bg-coral/10 transition-colors"
                        title="编辑"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartSpeaking(sub.id);
                        }}
                        className="p-1.5 rounded-lg text-ink/70 hover:text-coral hover:bg-coral/10 transition-colors"
                        title="练习这句"
                      >
                        <Mic size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
