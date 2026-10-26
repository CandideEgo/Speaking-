"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  usePublishWatchChrome,
  type WatchChromeState,
} from "@/components/watch/WatchChromeProvider";
import { ExamLevelSelector } from "@/components/watch/ExamLevelSelector";
import { cefrWithExamHint } from "@/lib/cefrLevels";
import type { VideoDetail } from "@/types";

export interface WatchChromeBridgeArgs {
  enabled: boolean;
  /** 视频详情：顶栏标题、频道名与难度都从它来。 */
  video: VideoDetail | null;
  /** 与页面底栏共用的那支 `<video>`（进度条直读它）。 */
  videoRef: RefObject<HTMLVideoElement>;
  /** ⋯ 面板开合（面板由页面渲染）。 */
  moreOpen: boolean;
  setMoreOpen: Dispatch<SetStateAction<boolean>>;
  onReplay: () => void;
  onSeek: (time: number, playAfterSeek?: boolean) => void;
  /** 考试词高亮的目标分级（store）。 */
  selectedExamLevel: string | null;
  onExamLevelChange: (level: string) => void;
  /** 返回出口（`useWatchReturn().go`，保留 `?from=` 语义）。 */
  onBack: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  /** 显式句导航恢复跟随 —— 页面把它与句导航成对使用。 */
  resumeFollow: () => void;
  navigateSubtitle: (delta: number) => void;
  /** 已稳定的「下一句」（`nextRef` + `onNextStable`，见 INV-025）。 */
  onNext: () => void;
  /** YouTube 源时序不可控 → 上一句/下一句置灰。 */
  isYtMode: boolean;
}

/**
 * 页面 → 壳：顶栏内容 + 底栏句柄（DEC-069 / #31）。
 *
 * 只放**低频**事实：`currentTime` 每秒跳 4 次，进 store 会让整个壳每秒重渲染 4 次。
 * 进度条由 `WatchBottomBar` 自己 rAF 直读 `videoRef`（见该文件顶部注释）。
 *
 * **这类 hook 只能放在页面那些 early return 之前**：hook 一旦在某个分支被跳过，React
 * 直接抛「Rendered fewer hooks than expected」并把整棵页面树卸载 —— 实测表现是只剩壳、
 * 页面内容整块消失（这个坑真踩过）。
 *
 * 返回值是交给壳的那份 chrome：页面自己的 JSX 也从它读 `attachVideo`
 * （`<video ref={chrome.attachVideo ?? videoRef}>`）。
 */
export function useWatchChromeBridge({
  enabled,
  video,
  videoRef,
  moreOpen,
  setMoreOpen,
  onReplay,
  onSeek,
  selectedExamLevel,
  onExamLevelChange,
  onBack,
  isPlaying,
  onTogglePlay,
  resumeFollow,
  navigateSubtitle,
  onNext,
  isYtMode,
}: WatchChromeBridgeArgs): WatchChromeState {
  const publish = usePublishWatchChrome();
  // setMoreOpen 是 useState 的 setter（稳定），列进依赖只是让 eslint 闭嘴，运行期无差别。
  const chromeTimer = useCallback(() => setMoreOpen((v) => !v), [setMoreOpen]);

  // `<video>` 的 ref 落点：`videoRef` 与底栏共用同一个元素，但底栏还需要「元素接上了」这次
  // 通知（`aria-valuemax` 必须重渲染才能改）。写法与 `nextRef` 同理 —— 把这次通知变成一次
  // **低频** state 变化（只在挂载/卸载时），而不是让整个壳跟着每次渲染重算（INV-025）。
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    // `useVideoPlayer` 的 ref 声明成 `RefObject<HTMLVideoElement>`（`useRef(null!)`）；
    // 元素卸载时 React 会用 null 调回调 ref，所以这里按可空写入 —— 与它的初值同性质。
    videoRef.current = el as HTMLVideoElement;
    setVideoEl(el);
    // videoRef 是 useRef 的固定对象，故意不进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chrome: WatchChromeState = useMemo(
    () => ({
      title: video?.title ?? "",
      levelText: `${video?.channel_name || "SeeWord"} · ${cefrWithExamHint(
        video?.difficulty_level || "B2"
      )}`,
      levelSelector: <ExamLevelSelector level={selectedExamLevel} onChange={onExamLevelChange} />,
      onBack,
      onMore: chromeTimer,
      moreOpen,
      videoRef,
      attachVideo,
      duration: video?.duration ?? null,
      isPlaying,
      onTogglePlay,
      // 显式「上一句」也算一次句导航：先恢复跟随，再走 hook 的上一句（顺序不能反 ——
      // `navigateSubtitle` 会同步改 `currentSubtitleIndex`，跟随 effect 就在那之后跑）。
      onPrev: () => {
        resumeFollow();
        navigateSubtitle(-1);
      },
      // onPrev 稳定（`navigateSubtitle` 是 useCallback + ref 读值），onNext 也必须稳定 ——
      // 见页面上的 `nextRef` / `onNextStable`。**别**把 `currentSubtitleIndex` 之类随状态
      // 变的东西加进依赖表：那会让壳每句重渲染 4 次（INV-025）。
      onNext,
      sentenceNavDisabled: !video?.subtitles?.length,
      onReplay,
      onSeek,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      video,
      selectedExamLevel,
      onBack,
      chromeTimer,
      moreOpen,
      isPlaying,
      onTogglePlay,
      navigateSubtitle,
      resumeFollow,
      isYtMode,
      onReplay,
      onSeek,
      onNext,
      attachVideo,
      // `attachVideo` 是稳定 useCallback；`videoEl` 只用来给「元素接上了」这次低频变化
      // 触发一次重算，它本身不参与 chrome 的值（所以上面对象里没引用它）。
      videoEl,
    ]
  );
  useEffect(() => {
    publish?.(enabled ? chrome : null);
  }, [publish, chrome, enabled]);
  useEffect(() => () => publish?.(null), [publish]);
  return chrome;
}
