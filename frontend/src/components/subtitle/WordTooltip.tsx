'use client';

import { BookmarkPlus, X } from 'lucide-react';

interface WordTooltipProps {
  word: string;
  meaning: string | null;
  onClose: () => void;
  onPronounce: () => void;
  onSave: () => void;
}

export default function WordTooltip({ word, meaning, onClose, onPronounce, onSave }: WordTooltipProps) {
  return (
    <div className="fixed bottom-4 right-4 w-80 rounded-lg border border-white/10 bg-navy-elevated p-4 shadow-xl z-30">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-white">{word}</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={onPronounce} className="inline-flex items-center gap-1 text-xs text-coral hover:underline">
          发音
        </button>
        <button
          onClick={onSave}
          className="inline-flex items-center gap-1 rounded bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral hover:bg-coral/20"
        >
          <BookmarkPlus size={12} /> 收藏
        </button>
      </div>
      {meaning ? (
        <p className="mt-2 text-sm text-white/70">{meaning}</p>
      ) : (
        <p className="mt-2 text-xs text-white/30">加载中...</p>
      )}
    </div>
  );
}
