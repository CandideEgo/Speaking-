import { create } from "zustand";

/** 字幕模式只保留核心三种：双语 / 英语 / 中文。其余练习模式已精简移除。 */
export type SubtitleMode = "bilingual" | "english" | "chinese";

interface WatchStore {
  subtitleMode: SubtitleMode;
  setSubtitleMode: (mode: SubtitleMode) => void;
  /** 右侧字幕面板是否折叠为窄轨（按需展开） */
  panelCollapsed: boolean;
  setPanelCollapsed: (collapsed: boolean) => void;
  leftPanelWidth: number;
  setLeftPanelWidth: (width: number) => void;
  videoAspectRatio: number;
  setVideoAspectRatio: (ratio: number) => void;
  /** 用户当前选中的考试目标层级 (cet4/cet6/...)，驱动字幕词高亮过滤。
   *  null 表示尚未从用户偏好加载。 */
  selectedExamLevel: string | null;
  setSelectedExamLevel: (level: string | null) => void;
  /** Reset all state to initial values (called on logout) */
  reset: () => void;
}

const INITIAL_STATE = {
  subtitleMode: "bilingual" as SubtitleMode,
  panelCollapsed: false,
  leftPanelWidth: 58,
  videoAspectRatio: 16 / 9,
  selectedExamLevel: null as string | null,
};

export const useWatchStore = create<WatchStore>((set) => ({
  ...INITIAL_STATE,
  setSubtitleMode: (mode) => set({ subtitleMode: mode }),
  setPanelCollapsed: (collapsed) => set({ panelCollapsed: collapsed }),
  setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
  setVideoAspectRatio: (ratio) => set({ videoAspectRatio: ratio }),
  setSelectedExamLevel: (level) => set({ selectedExamLevel: level }),
  reset: () => set(INITIAL_STATE),
}));
