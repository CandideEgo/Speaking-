import { create } from 'zustand';

export type SubtitleMode = 'bilingual' | 'english' | 'chinese' | 'reading' | 'dictation' | 'fillblank' | 'flashcard' | 'translate';

interface WatchStore {
  subtitleMode: SubtitleMode;
  setSubtitleMode: (mode: SubtitleMode) => void;
}

export const useWatchStore = create<WatchStore>((set) => ({
  subtitleMode: 'bilingual',
  setSubtitleMode: (mode) => set({ subtitleMode: mode }),
}));
