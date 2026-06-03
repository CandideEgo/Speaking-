'use client';

import { cn } from '@/lib/utils';
import { useWatchStore, type SubtitleMode } from '@/stores/watchStore';
import {
  Languages, BookOpen, PenLine, FileEdit, Brain, ArrowLeftRight, BookText,
} from 'lucide-react';

const modes: { key: SubtitleMode; label: string; icon: React.ReactNode }[] = [
  { key: 'bilingual', label: '双语', icon: <Languages size={14} /> },
  { key: 'english', label: '英文', icon: <BookOpen size={14} /> },
  { key: 'chinese', label: '中文', icon: <BookText size={14} /> },
  { key: 'reading', label: '阅读', icon: <PenLine size={14} /> },
  { key: 'dictation', label: '听写', icon: <FileEdit size={14} /> },
  { key: 'fillblank', label: '填空', icon: <FileEdit size={14} /> },
  { key: 'flashcard', label: '闪卡', icon: <Brain size={14} /> },
  { key: 'translate', label: '翻译', icon: <ArrowLeftRight size={14} /> },
];

export default function SubtitleModeTabs() {
  const { subtitleMode, setSubtitleMode } = useWatchStore();

  return (
    <div className="flex items-center gap-0.5 border-b border-white/10 bg-navy-elevated px-2 py-1.5 overflow-x-auto scrollbar-hide shrink-0">
      {modes.map((m) => (
        <button
          key={m.key}
          onClick={() => setSubtitleMode(m.key)}
          className={cn(
            'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors',
            subtitleMode === m.key
              ? 'bg-coral/15 text-coral'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          )}
        >
          {m.icon}
          {m.label}
        </button>
      ))}
    </div>
  );
}
