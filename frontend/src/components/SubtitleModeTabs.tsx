'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { useWatchStore, type SubtitleMode } from '@/stores/watchStore';
import {
  Languages, BookOpen, EyeOff, FileEdit, Brain, ArrowLeftRight, ListChecks,
} from 'lucide-react';

const modes: { key: SubtitleMode; label: string; icon: React.ReactNode }[] = [
  { key: 'bilingual', label: '双语', icon: <Languages size={14} /> },
  { key: 'english', label: '英语', icon: <BookOpen size={14} /> },
  { key: 'reading', label: '阅读', icon: <EyeOff size={14} /> },
  { key: 'dictation', label: '听写', icon: <FileEdit size={14} /> },
  { key: 'translate', label: '句子翻译', icon: <ArrowLeftRight size={14} /> },
  { key: 'fillblank', label: '填空', icon: <ListChecks size={14} /> },
  { key: 'flashcard', label: '词卡', icon: <Brain size={14} /> },
];

export default function SubtitleModeTabs() {
  const { subtitleMode, setSubtitleMode } = useWatchStore();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent) {
    const currentIndex = modes.findIndex((m) => m.key === subtitleMode);
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % modes.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + modes.length) % modes.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = modes.length - 1;
    } else {
      return;
    }

    setSubtitleMode(modes[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide shrink-0" role="tablist" aria-label="字幕模式" onKeyDown={handleKeyDown}>
      {modes.map((m, i) => (
        <button
          key={m.key}
          ref={(el) => { tabRefs.current[i] = el; }}
          onClick={() => setSubtitleMode(m.key)}
          role="tab"
          aria-selected={subtitleMode === m.key}
          tabIndex={subtitleMode === m.key ? 0 : -1}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150',
            subtitleMode === m.key
              ? 'bg-coral/10 text-coral shadow-sm'
              : 'text-muted-foreground hover:text-ink hover:bg-cream-soft'
          )}
        >
          {m.icon}
          {m.label}
        </button>
      ))}
    </div>
  );
}
