"use client";

import {
  createContext,
  useContext,
  useState,
  type RefObject,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePathname } from "next/navigation";
import { WatchBottomBar } from "@/components/watch/WatchBottomBar";

/** Low-frequency playback callbacks shared by the watch page and its inline controls. */
export interface WatchChromeState {
  /** 顶栏中栏标题（一行 `truncate`）。 */
  title?: string;
  /** 顶栏中栏级别文本，来源 `channel · cefrWithExamHint`（与桌面 meta 细行同源）。 */
  levelText?: string;
  /** 壳顶栏右端的级别选择器（`ExamLevelSelector` 实例，由页面构造）。 */
  levelSelector?: React.ReactNode;
  /** 返回出口（复用页面的 `back.go`，保留 `?from=` 语义）。 */
  onBack?: () => void;
  /** 顶栏右端 ⋯：开关「更多」面板。 */
  onMore?: () => void;
  /** ⋯ 面板是否已打开（面板由页面渲染；底栏靠它让位，壳顶栏靠它标 `aria-expanded`）。 */
  moreOpen?: boolean;

  /** 底栏进度条直读的那支 `<video>`；YouTube 回退路径为 null（进度条只读走不动）。 */
  videoRef?: RefObject<HTMLVideoElement | null>;
  /**
   * 页面 `<video>` 的 ref 落点 —— 与 `videoRef` **指向同一个元素**，但用回调 ref 的形式
   * 让底栏能观察到「元素接上了」这件事（DEC-070 T6）。
   *
   * 为什么不能只用 `videoRef`：`<video>` 要等 `playbackMode === "ready"` 才挂载，而
   * `videoRef` 是固定对象 —— `.current` 从 null 变成元素不会重跑任何 effect，`aria-valuemax`
   * 这类**必须重渲染才能改**的属性就永远停在兜底值上（实测 612，而媒体是 719.98）。
   * 必须由页面接管 `ref`：`<video ref={chrome.attachVideo ?? videoRef}>`。
   */
  attachVideo?: (el: HTMLVideoElement | null) => void;
  /** 总时长（秒）—— 低频，允许进 store。 */
  duration?: number | null;
  /** 是否正在播放（`useVideoPlayer` 轮询校正后的单一事实源）。 */
  isPlaying?: boolean;
  /** 播放/暂停（`useVideoPlayer.togglePlayPause`，同时覆盖 HTML5 与 YouTube 两条路）。 */
  onTogglePlay?: () => void;
  /** 上一句。 */
  onPrev?: () => void;
  /** 下一句。 */
  onNext?: () => void;
  /** YouTube 源时序不可控 → 上一句/下一句置灰，`title` 说明原因。 */
  sentenceNavDisabled?: boolean;
  onReplay?: () => void;
  onSeek?: (time: number, playAfterSeek?: boolean) => void;
}

const ChromeContext = createContext<WatchChromeState | null>(null);
const PublishContext = createContext<Dispatch<SetStateAction<WatchChromeState | null>> | null>(
  null
);

export function WatchChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<WatchChromeState | null>(null);
  return (
    <PublishContext.Provider value={setChrome}>
      <ChromeContext.Provider value={chrome}>{children}</ChromeContext.Provider>
    </PublishContext.Provider>
  );
}

export function usePublishWatchChrome() {
  return useContext(PublishContext);
}

/** A normal shell row above global navigation, outside the scrolling main. */
export function WatchShellControls() {
  const chrome = useContext(ChromeContext);
  const pathname = usePathname();
  return chrome && /^\/watch\/[^/]+$/.test(pathname) ? <WatchBottomBar chrome={chrome} /> : null;
}
