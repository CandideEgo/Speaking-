"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { speakerColor } from "@/lib/avatar";
import { Mic, Play, Copy, Heart, Edit3, Check } from "lucide-react";

import { useWatchStore } from "@/stores/watchStore";
import type { Subtitle } from "@/types";

interface SubtitleListProps {
  subtitles: Subtitle[];
  currentIndex: number;
  selectedWord: string | null;
  onSubtitleClick: (index: number, startTime: number) => void;
  onWordClick: (word: string) => void;
  onStartSpeaking: (subtitleId: string) => void;
  /** Words the user is actively learning (Sprint 3 vocab recurrence highlight). */
  vocabWords?: Set<string>;
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

/** Get initials from speaker name */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Group subtitles by speaker */
function groupSubtitlesBySpeaker(
  subtitles: Subtitle[]
): { speaker: string | null; subtitles: Subtitle[]; startIndex: number }[] {
  const groups: {
    speaker: string | null;
    subtitles: Subtitle[];
    startIndex: number;
  }[] = [];

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

const HighlightedText = memo(function HighlightedText({
  text,
  highlightWords,
  selectedWord,
  onWordClick,
  vocabWords,
}: {
  text: string;
  highlightWords: string[];
  selectedWord: string | null;
  onWordClick: (word: string) => void;
  vocabWords?: Set<string>;
}) {
  const words = text.split(/(\s+)/);

  return (
    <span className="text-copy leading-relaxed text-ink/90">
      {words.map((word, wi) => {
        if (/^\s+$/.test(word)) {
          return <span key={wi}>{word}</span>;
        }
        const cleanWord = word.replace(/[.,!?;:'"()[\]]/g, "").toLowerCase();
        const isHighlighted = highlightWords.includes(cleanWord);
        const isSelected = selectedWord === cleanWord;
        const isVocab = vocabWords?.has(cleanWord) ?? false;

        return (
          <span
            key={wi}
            onClick={(e) => {
              e.stopPropagation();
              onWordClick(word);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onWordClick(word);
              }
            }}
            className={cn(
              "cursor-pointer rounded-md transition-colors duration-150",
              isSelected
                ? "bg-brand-500/20 text-brand-500"
                : isVocab
                  ? "bg-brand-100 text-brand-700 underline decoration-brand-400 decoration-2 underline-offset-2 px-0.5"
                  : isHighlighted
                    ? "bg-red-soft text-error px-0.5"
                    : "hover:bg-brand-500/10"
            )}
            title={isVocab ? "在你的词库中" : undefined}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
});

interface SubtitleItemProps {
  sub: Subtitle;
  index: number;
  isActive: boolean;
  selectedWord: string | null;
  showEnglishOnly: boolean;
  copiedId: string | null;
  favorited: boolean;
  onSubtitleClick: (index: number, startTime: number) => void;
  onWordClick: (word: string) => void;
  onCopy: (subtitleId: string, text: string) => void;
  onFavorite: (subtitleId: string) => void;
  onStartSpeaking: (subtitleId: string) => void;
  vocabWords?: Set<string>;
}

const SubtitleItem = memo(function SubtitleItem({
  sub,
  index,
  isActive,
  selectedWord,
  showEnglishOnly,
  copiedId,
  favorited,
  onSubtitleClick,
  onWordClick,
  onCopy,
  onFavorite,
  onStartSpeaking,
  vocabWords,
}: SubtitleItemProps) {
  const highlightWords = useMemo(
    () => parseDifficultyWords(sub.difficulty_words),
    [sub.difficulty_words]
  );

  return (
    <div
      id={`subtitle-${index}`}
      className={cn(
        "group relative rounded-lg transition-all duration-200",
        isActive
          ? "bg-surface-card shadow-sm border border-brand-500/30"
          : "hover:bg-surface-soft/50"
      )}
    >
      {/* Main content area */}
      <button
        onClick={() => onSubtitleClick(index, sub.start_time)}
        className="w-full text-left px-4 py-3"
      >
        {/* English text with highlighted words */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <HighlightedText
              text={sub.text_en}
              highlightWords={highlightWords}
              selectedWord={selectedWord}
              onWordClick={onWordClick}
              vocabWords={vocabWords}
            />
          </div>
        </div>

        {/* Chinese translation */}
        {!showEnglishOnly && sub.text_zh && (
          <p className="mt-1.5 text-copy text-muted">{sub.text_zh}</p>
        )}

        {/* Grammar note */}
        {sub.grammar_note && (
          <p className="mt-1.5 text-meta text-warning/80">提示：{sub.grammar_note}</p>
        )}
      </button>

      {/* Bottom action bar: timestamp + action buttons */}
      <div className="flex items-center justify-between px-4 pb-3">
        {/* Timestamp and index */}
        <div className="flex items-center gap-2">
          <span className="text-caption text-muted font-mono">{index + 1}</span>
          <span className="text-caption text-muted font-mono">
            {formatTime(sub.start_time)} - {formatTime(sub.end_time)}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSubtitleClick(index, sub.start_time);
            }}
            className="p-1.5 rounded-lg text-ink/70 hover:text-brand-500 hover:bg-brand-500/10 transition-colors"
            title="播放"
            aria-label="播放此句"
          >
            <Play size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy(sub.id, sub.text_en);
            }}
            className="p-1.5 rounded-lg text-ink/70 hover:text-brand-500 hover:bg-brand-500/10 transition-colors"
            title="复制"
            aria-label="复制字幕"
          >
            {copiedId === sub.id ? (
              <Check size={14} className="text-success" />
            ) : (
              <Copy size={14} />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite(sub.id);
            }}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              favorited
                ? "text-brand-500 bg-brand-500/10"
                : "text-ink/70 hover:text-brand-500 hover:bg-brand-500/10"
            )}
            title="收藏"
            aria-label="收藏字幕"
          >
            <Heart size={14} className={favorited ? "fill-current" : ""} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Implement edit functionality
            }}
            className="p-1.5 rounded-lg text-ink/70 hover:text-brand-500 hover:bg-brand-500/10 transition-colors"
            title="编辑"
            aria-label="编辑字幕"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartSpeaking(sub.id);
            }}
            className="p-1.5 rounded-lg text-ink/70 hover:text-brand-500 hover:bg-brand-500/10 transition-colors"
            title="练习这句"
            aria-label="练习口语"
          >
            <Mic size={14} />
          </button>
        </div>
      </div>
    </div>
  );
});

export default function SubtitleList({
  subtitles,
  currentIndex,
  selectedWord,
  onSubtitleClick,
  onWordClick,
  onStartSpeaking,
  vocabWords,
}: SubtitleListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());
  const { subtitleMode } = useWatchStore();
  const showEnglishOnly = subtitleMode === "english";

  // Pre-compute subtitle id -> index map for O(1) lookups
  const subtitleIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    subtitles.forEach((sub, i) => map.set(sub.id, i));
    return map;
  }, [subtitles]);

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

  // Pre-compute grouped subtitles with indices from the map
  const groups = useMemo(() => {
    const grouped = groupSubtitlesBySpeaker(subtitles);
    return grouped.map((group) => ({
      speaker: group.speaker,
      items: group.subtitles.map((sub) => ({
        sub,
        index: subtitleIndexMap.get(sub.id)!,
      })),
    }));
  }, [subtitles, subtitleIndexMap]);

  return (
    <div className="flex flex-col gap-2 p-3">
      {groups.map((group, groupIdx) => {
        const speaker = group.speaker;

        return (
          <div key={groupIdx} className="flex flex-col gap-1">
            {/* Speaker header */}
            {speaker && (
              <div className="flex items-center gap-2 px-2 py-1">
                <div
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full text-meta font-bold border",
                    speaker ? speakerColor(speaker) : ""
                  )}
                >
                  {getInitials(speaker)}
                </div>
                <span className="text-copy font-medium text-ink/80">{speaker}</span>
              </div>
            )}

            {/* Subtitles in this group */}
            {group.items.map(({ sub, index }) => (
              <SubtitleItem
                key={sub.id}
                sub={sub}
                index={index}
                isActive={index === currentIndex}
                selectedWord={selectedWord}
                showEnglishOnly={showEnglishOnly}
                copiedId={copiedId}
                favorited={favorited.has(sub.id)}
                onSubtitleClick={onSubtitleClick}
                onWordClick={onWordClick}
                onCopy={handleCopy}
                onFavorite={handleFavorite}
                onStartSpeaking={onStartSpeaking}
                vocabWords={vocabWords}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
