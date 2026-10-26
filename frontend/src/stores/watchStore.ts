import { create } from "zustand";
import {
  DEFAULT_WATCH_RATIO,
  WATCH_LAYOUT_STORAGE_KEY,
  readWatchLayout,
  type MobileFrameSize,
} from "@/lib/watchLayout";

/** 字幕显示模式：双语 / 英文 / 中文 / 关闭（D1：S 键循环，含隐藏档；用户可见名见 lib/subtitleModes）。 */
export type SubtitleMode = "bilingual" | "english" | "chinese" | "hidden";

/** localStorage key：字幕模式跨会话保持（产品设计规划 §D1）。 */
export const SUBTITLE_MODE_STORAGE_KEY = "seeword_subtitle_mode";

const VALID_MODES: SubtitleMode[] = ["bilingual", "english", "chinese", "hidden"];

function loadPersistedSubtitleMode(): SubtitleMode {
  if (typeof window === "undefined") return "bilingual";
  try {
    const saved = window.localStorage.getItem(SUBTITLE_MODE_STORAGE_KEY);
    return VALID_MODES.includes(saved as SubtitleMode) ? (saved as SubtitleMode) : "bilingual";
  } catch {
    return "bilingual";
  }
}

interface WatchStore {
  subtitleMode: SubtitleMode;
  setSubtitleMode: (mode: SubtitleMode) => void;
  /** 挂载后从 localStorage 恢复字幕模式（BUG-13）。
   *
   *  模块初始化时读会在「服务端无 storage、首帧用默认值 / 客户端读到已存值」
   *  之间产生 hydration 不一致；改为首帧恒为 bilingual，由挂载 effect 补一次。 */
  hydrateSubtitleMode: () => void;
  /** 右侧字幕面板是否折叠为窄轨（按需展开） */
  panelCollapsed: boolean;
  setPanelCollapsed: (collapsed: boolean) => void;
  leftPanelWidth: number;
  setLeftPanelWidth: (width: number) => void;
  mobileFrameSize: MobileFrameSize;
  setMobileFrameSize: (size: MobileFrameSize) => void;
  hydrateLayout: () => void;
  resetLayout: () => void;
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
  leftPanelWidth: DEFAULT_WATCH_RATIO,
  mobileFrameSize: "standard" as MobileFrameSize,
  videoAspectRatio: 16 / 9,
  selectedExamLevel: null as string | null,
};

function persistLayout(leftPanelWidth: number, mobileFrameSize: MobileFrameSize) {
  try {
    window.localStorage.setItem(
      WATCH_LAYOUT_STORAGE_KEY,
      JSON.stringify({ leftPanelWidth, mobileFrameSize })
    );
  } catch {
    // Layout remains usable when browser storage is unavailable.
  }
}

export const useWatchStore = create<WatchStore>((set, get) => ({
  ...INITIAL_STATE,
  hydrateSubtitleMode: () => set({ subtitleMode: loadPersistedSubtitleMode() }),
  setSubtitleMode: (mode) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SUBTITLE_MODE_STORAGE_KEY, mode);
      } catch {
        // storage unavailable (quota/private mode) — in-memory state still applies
      }
    }
    set({ subtitleMode: mode });
  },
  setPanelCollapsed: (collapsed) => set({ panelCollapsed: collapsed }),
  setLeftPanelWidth: (width) => {
    if (!Number.isFinite(width)) return;
    const leftPanelWidth = Math.min(90, Math.max(10, width));
    set({ leftPanelWidth });
    persistLayout(leftPanelWidth, get().mobileFrameSize);
  },
  setMobileFrameSize: (mobileFrameSize) => {
    set({ mobileFrameSize });
    persistLayout(get().leftPanelWidth, mobileFrameSize);
  },
  hydrateLayout: () => {
    try {
      set(readWatchLayout(window.localStorage.getItem(WATCH_LAYOUT_STORAGE_KEY)));
    } catch {
      // Keep defaults if storage access is blocked.
    }
  },
  resetLayout: () => {
    set({
      leftPanelWidth: DEFAULT_WATCH_RATIO,
      mobileFrameSize: "standard",
      panelCollapsed: false,
    });
    persistLayout(DEFAULT_WATCH_RATIO, "standard");
  },
  setVideoAspectRatio: (ratio) => set({ videoAspectRatio: ratio }),
  setSelectedExamLevel: (level) => set({ selectedExamLevel: level }),
  reset: () => set(INITIAL_STATE),
}));
