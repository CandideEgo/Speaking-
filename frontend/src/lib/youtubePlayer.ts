/**
 * YouTube IFrame 播放后端的适配器（FE-06 / A15）。
 *
 * 观看页有两条播放后端：有本地文件时用原生 `<video>`，没有时退回 YouTube
 * IFrame。两者的播放语义已由 `lib/mediaLifecycle.ts` 统一，但**接线**一直是
 * 两套：IFrame API 的脚本加载、播放器创建、销毁原先和原生播放器一起长在
 * `useVideoPlayer` 里。这里把 IFrame 那一侧收成一个没有 React 依赖的模块，
 * 让 hook 只保留「引用 + 事件映射 + 播放时钟」。
 *
 * 这个模块只做传输层的事：注入脚本、创建/销毁播放器、转发回调。播放状态怎么
 * 解释、字幕怎么同步、进度怎么保存，都留在调用方。
 */

/** 我们实际用到的 IFrame 播放器方法。 */
export interface YTPlayerInstance {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  destroy: () => void;
  setPlaybackRate?: (rate: number) => void;
  setVolume?: (volume: number) => void;
  mute?: () => void;
  unMute?: () => void;
}

export interface YTPlayerHandlers {
  onReady: () => void;
  onStateChange: (event: { data?: number }) => void;
  onError: () => void;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, unknown>;
  events?: {
    onReady?: () => void;
    onStateChange?: (e: { data?: number }) => void;
    onError?: () => void;
  };
}

interface YTPlayerClass {
  new (el: HTMLElement, options: YTPlayerOptions): YTPlayerInstance;
}

declare global {
  interface Window {
    YT?: { Player?: YTPlayerClass };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SCRIPT_ID = "yt-iframe-api";

/**
 * 加载 IFrame API。已经可用时立即 resolve；脚本已注入但回调未触发时，挂到
 * `onYouTubeIframeAPIReady` 上排队（保留原有回调，不覆盖别人的）。
 */
export function ensureYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (document.getElementById(API_SCRIPT_ID)) return; // 脚本在，等回调即可
    const script = document.createElement("script");
    script.id = API_SCRIPT_ID;
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
}

/**
 * 在 `el` 里创建播放器。容器或 API 尚未就绪时返回 null——调用方据此保留
 * 「还没挂上」的状态，等容器渲染后的下一次 effect 重试。
 */
export function createYouTubePlayer(
  el: HTMLElement | null,
  videoId: string,
  handlers: YTPlayerHandlers
): YTPlayerInstance | null {
  const Player = window.YT?.Player;
  if (!el || !Player) return null;
  return new Player(el, {
    videoId,
    playerVars: { rel: 0, playsinline: 1 },
    events: handlers,
  });
}

/** 销毁播放器；重复销毁或对 null 调用都是安全的。 */
export function destroyYouTubePlayer(player: YTPlayerInstance | null): void {
  try {
    player?.destroy?.();
  } catch {
    /* already destroyed */
  }
}
