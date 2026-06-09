import { create } from 'zustand';

export type SubtitleMode = 'bilingual' | 'english' | 'chinese' | 'reading' | 'dictation' | 'fillblank' | 'flashcard' | 'translate';

interface WatchStore {
  subtitleMode: SubtitleMode;
  setSubtitleMode: (mode: SubtitleMode) => void;
  leftPanelWidth: number;
  setLeftPanelWidth: (width: number) => void;
  videoAspectRatio: number;
  setVideoAspectRatio: (ratio: number) => void;
}

export const useWatchStore = create<WatchStore>((set) => ({
  subtitleMode: 'bilingual',
  setSubtitleMode: (mode) => set({ subtitleMode: mode }),
  leftPanelWidth: 50,
  setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
  videoAspectRatio: 16 / 9,
  setVideoAspectRatio: (ratio) => set({ videoAspectRatio: ratio }),
}));
