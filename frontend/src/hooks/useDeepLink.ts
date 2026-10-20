"use client";

import { useEffect, useRef, type RefObject } from "react";

import type { PlaybackMode } from "@/hooks/useVideoPlayer";
import { resolveWatchFocus } from "@/lib/watchEntry";
import type { Subtitle } from "@/types";

export interface DeepLinkArgs {
  /** Player mode. The link only applies once the video can be seeked. */
  playbackMode: PlaybackMode;
  /**
   * The loaded video's subtitles — `sub` is resolved to an index against these,
   * so the sentence can be highlighted and followed. `null`/`undefined` (video
   * not loaded) behaves as an empty list, exactly like the `video.subtitles ?? []`
   * this replaced.
   */
  subtitles: Subtitle[] | null | undefined;
  /** The watch URL's params (`useSearchParams()`): read-only, stable per URL. */
  params: URLSearchParams;
  /** The `<video>` ref, touched only to set `currentTime`. */
  videoRef: RefObject<HTMLVideoElement>;
  /**
   * 深链落点算一次**显式句导航**：高亮该句并把字幕跟随拉回来（DEC-073 的
   * `resumeFollow`）。只有句 id 真的解析到某一行时才调用。
   */
  onSentenceFocus: (index: number) => void;
  /** 词高亮：字幕列表的 selectedWord 联动 + 词卡。 */
  onWordFocus: (word: string) => void;
  /** Called only when the link explicitly requests autoplay. */
  onAutoplay?: () => void;
  /** Seek through the active playback backend; optionally starts playback. */
  onSeek?: (seconds: number, playAfterSeek: boolean) => void;
}

/**
 * Deep-link focus（D3b/S7b）：`?sub=<句 id>` 落在某一句上（「回到对应句子」/
 * 「回看原句」），`?word=` 顺带高亮那个词，遗留的 `?t=` 作为纯 seek 保留。
 * `sub` 赢过 `t` —— 句 id 稳定，秒数会随重转写漂移（见 `lib/watchEntry`）。
 *
 * 应用时机与去重是这段逻辑唯一咬人的地方：视频就绪后**每个链接只应用一次**，
 * 按链接自身的 `key` 记账。少了它，词卡/字幕刷新导致的任何一次重渲染都会把
 * 播放位置拽回深链落点。
 */
export function useDeepLink({
  playbackMode,
  subtitles,
  params,
  videoRef,
  onSentenceFocus,
  onWordFocus,
  onAutoplay,
  onSeek,
}: DeepLinkArgs): void {
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (playbackMode !== "ready") return;
    const focus = resolveWatchFocus(params, subtitles ?? []);
    if (!focus) return;
    if (appliedRef.current === focus.key) return;
    appliedRef.current = focus.key;

    // 顺序与拆分前一致：先恢复跟随+高亮当前句，再 seek，最后点词。
    if (focus.subtitleIndex !== null) onSentenceFocus(focus.subtitleIndex);
    const autoplay = params.get("autoplay") === "1";
    if (focus.seconds !== null) {
      if (onSeek) onSeek(focus.seconds, autoplay);
      else if (videoRef.current) videoRef.current.currentTime = focus.seconds;
    }
    if (focus.word) onWordFocus(focus.word);
    if (autoplay && focus.seconds === null) onAutoplay?.();
    // videoRef 是稳定 ref；焦点回调只在应用那一刻读取。key 去重保证依赖变化
    // 或字幕刷新不会把播放位置反复拽回句子。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackMode, subtitles, params, onAutoplay, onSeek]);
}
