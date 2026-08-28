import { create } from "zustand";

/** 字幕显示模式：双语 / 英语 / 中文 / 隐藏（D1：S 键循环，含隐藏档）。 */
export type SubtitleMode = "bilingual" | "english" | "chinese" | "hidden";

/** localStorage key：字幕模式跨会话保持（产品设计规划 §D1）。 */
export const SUBTITLE_MODE_STORAGE_KEY = "seeword_subtitle_mode";

const VALID_MODES: SubtitleMode[] = ["bilingual", "english", "chinese", "hidden"];

function loadPersistedSubtitleMode(): SubtitleMode {
  if (typeof window === "undefined") return "bilingual";
  const saved = window.localStorage.getItem(SUBTITLE_MODE_STORAGE_KEY);
  return VALID_MODES.includes(saved as SubtitleMode) ? (saved as SubtitleMode) : "bilingual";
}

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
  subtitleMode: loadPersistedSubtitleMode(),
  setSubtitleMode: (mode) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SUBTITLE_MODE_STORAGE_KEY, mode);
    }
    set({ subtitleMode: mode });
  },
  setPanelCollapsed: (collapsed) => set({ panelCollapsed: collapsed }),
  setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
  setVideoAspectRatio: (ratio) => set({ videoAspectRatio: ratio }),
  setSelectedExamLevel: (level) => set({ selectedExamLevel: level }),
  reset: () => set(INITIAL_STATE),
}));
