/**
 * 播放生命周期 → 媒体 UI 状态的纯映射（FE-06 提取点）。
 *
 * 观看页有两个播放后端（原生 `<video>` 与 YouTube IFrame），它们的 DOM/IFrame
 * 事件名不同，但落到界面上的状态只有五种：播放中、暂停、缓冲、结束、错误。
 * 这段映射原先分别写在 `useVideoPlayer` 的两个事件处理器里，改一处忘另一处
 * 就会让两条后端的行为分叉；抽成纯函数后可以单测，也给了「播放生命周期」
 * 一个明确的输入/输出边界。
 *
 * 返回 `null` 表示「这次事件不改变当前状态」——例如暂停状态下的 `waiting`
 * 只是浏览器在预取，不该把界面从 paused 换成 buffering。
 */

export type MediaUiState = "loading" | "buffering" | "paused" | "playing" | "ended" | "error";

/** 两个后端共有的语义事件。 */
export type MediaLifecycleEvent = "play" | "pause" | "waiting" | "ready" | "ended" | "error";

export interface MediaFacts {
  /** 媒体元素当前是否暂停（YouTube 用 IFrame 状态换算）。 */
  paused: boolean;
  /** 是否已播到结尾（原生 `<video>.ended`）。 */
  ended: boolean;
}

export function mediaStateFor(event: MediaLifecycleEvent, facts: MediaFacts): MediaUiState | null {
  switch (event) {
    case "play":
      return "playing";
    case "pause":
      return facts.ended ? "ended" : "paused";
    case "ready":
      return facts.paused ? "paused" : "playing";
    case "waiting":
      // 暂停时的 waiting/stalled 只是预取，不改界面状态。
      return facts.paused ? null : "buffering";
    case "ended":
      return "ended";
    case "error":
      return "error";
  }
}

/** YouTube IFrame 的 `onStateChange` 数字状态 → 语义事件。 */
export function youTubeEventFor(state: number | undefined): MediaLifecycleEvent {
  switch (state) {
    case 1:
      return "play";
    case 3:
      return "waiting";
    case 0:
      return "ended";
    // 2 = paused、5 = cued、-1 = unstarted；旧实现对「其它状态」一律落到 paused。
    default:
      return "pause";
  }
}
