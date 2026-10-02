"use client";

/**
 * WatchChromeStore — 播放页 ↔ 应用壳之间的**唯一接口**（DEC-069 / #31）。
 *
 * 背景：入画字幕在真机上盖住说话人的脸（`docs/design/mobile/app-shots/13-*`），
 * 而首屏 776px 里 355px 给了次要信息。决议是把移动端播放页的观看控制搬进
 * **壳的顶栏与底栏**（同一个槽位），画面还给画面、文稿还给文稿。
 *
 * 分工：
 *   · 壳（`MainLayoutInner`）只按 `pathname.startsWith("/watch/")` 决定「渲染哪两个栏」，
 *     **不等页面挂载** —— 否则首屏会闪一帧旧顶栏（64px 全局噪音 → 44px 观看页形态）；
 *   · 页面用 `useWatchChrome(state)` 把顶栏内容与播放句柄交给壳。
 *
 * 为什么是模块级 store 而不是 `createContext`：provider 在壳里、页面是它的子树，
 * 页面 publish 时只有**壳这一个订阅者**要重渲染；用 context 传值就得把 setter 也塞进去，
 * 等于把所有页面都变成发布者。
 *
 * **只有一个全局槽位、没有 session/所有权记账** —— 同一时刻只可能有一个播放页在挂载
 * （路由决定），所以「谁在写」这件事不需要身份判定。第一版按「每个挂载周期一个 sessionId,
 * 谁登记成 active 谁说话」做过，实测在开发模式下必炸：React 的渲染顺序保证不了
 * `activeSessionId` 与发布者同一个 id（壳与页面各自渲染时会互相覆写那个变量，
 * 结果 `publish` 永远被所有权检查丢掉，顶栏一片空白、底栏按钮全是死的）。
 * 少一层身份，就少一个能出错的地方。
 *
 * 两条设计约束，别改回去：
 *   1. **默认值是空 chrome**，不是抛错。任何页面不发布也照常渲染（壳不该因为一个页面
 *      没准备好而崩），只是两个栏是空的；非播放页读到的也永远是空值。
 *   2. **高频读数绝不进这里**。`currentTime` 每秒跳 4 次，进 state 会让整个壳每秒重渲染
 *      4 次；进度条由 `WatchBottomBar` 自己 `requestAnimationFrame` 直读 `videoRef`，
 *      只改那根 DOM 的 `style`（见 `WatchBottomBar.tsx`）。这里只放**低频**事实。
 *   3. **只放稳定引用或 ref 读值**（INV-025）。凡闭包读了组件状态（`currentSubtitleIndex`
 *      这类），必须先做 ref 镜像再进 store —— `nextRef` + `onNextStable`（`page.tsx`）。
 *      教训：第一版 `onPrev` 走 `navigateSubtitle`（稳定 + ref 读值）、`onNext` 直接塞
 *      `handleNextSubtitle`（每次渲染新建、闭包里读 index），于是 `publish` 的浅比较
 *      永远认为「没变」⇒ 过期闭包永久驻留，实测 10/190 点一次往回跳到 2/190、再点点不动。
 *      判据不是「有没有传函数」，而是「这个函数会不会随组件状态变」。
 */

import { useEffect, useSyncExternalStore, type RefObject } from "react";

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
  /** 底栏「跟读」入口。 */
  onShadowing?: () => void;
  /** 跟读抽屉是否打开（打开时按钮呈激活态）。 */
  shadowingActive?: boolean;
}

const EMPTY: WatchChromeState = {};

let state: WatchChromeState = EMPTY;
const listeners = new Set<() => void>();

function shallowEqual(a: WatchChromeState, b: WatchChromeState): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof WatchChromeState)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function publish(next: WatchChromeState) {
  if (shallowEqual(state, next)) return;
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 壳侧订阅。`active=false`（非播放页）时永远读空值且不订阅 —— 其他路由零成本，
 * 也顺手切断了「上一个播放页遗留的 chrome」泄漏到别的路由。
 */
export function useWatchChromeValue(active: boolean): WatchChromeState {
  return useSyncExternalStore(
    active ? subscribe : () => () => {},
    () => (active ? state : EMPTY),
    () => EMPTY
  );
}

/**
 * 页面侧发布：把这一帧的 chrome 交给壳。**在 effect 里写**，所以不是渲染期副作用
 * （不违反 React 的纯度要求，也不会在 StrictMode 的双渲染里写两次表）。
 *
 * 值没变不通知订阅者 —— 页面每次渲染都调用它也不会让壳跟着重渲染。
 */
export function useWatchChrome(chrome: WatchChromeState) {
  useEffect(() => {
    publish(chrome);
  });
  // 卸载时撤回（换页面/退出播放页）：下一个播放页挂载时会重新写。
  useEffect(() => () => publish(EMPTY), []);
}
