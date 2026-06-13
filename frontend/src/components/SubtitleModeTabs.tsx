'use client';

import { cn } from '@/lib/utils';
import { useWatchStore, type SubtitleMode } from '@/stores/watchStore';
import {
  Languages, BookOpen, FileEdit, Brain, ArrowLeftRight, ListChecks,
} from 'lucide-react';

const modes: { key: SubtitleMode; label: string; icon: React.ReactNode }[] = [
  { key: 'bilingual', label: '双语', icon: <Languages size={14} /> },
  { key: 'english', label: '英语', icon: <BookOpen size={14} /> },
  { key: 'dictation', label: '听写', icon: <FileEdit size={14} /> },
  { key: 'translate', label: '句子翻译', icon: <ArrowLeftRight size={14} /> },
  { key: 'fillblank', label: '填空', icon: <ListChecks size={14} /> },
  { key: 'flashcard', label: '词卡', icon: <Brain size={14} /> },
];

export default function SubtitleModeTabs() {
  const { subtitleMode, setSubtitleMode } = useWatchStore();

  return (
    <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide shrink-0">
      {modes.map((m) => (
        <button
          key={m.key}
          onClick={() => setSubtitleMode(m.key)}
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
