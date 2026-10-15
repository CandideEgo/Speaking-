/**
 * 字幕跟随的几何（DEC-073）——「追到哪、什么时候追」这一步是纯算术，抽出来单独
 * 可测：真正难写对的部分不在 DOM 里，而在阈值与落点这几个常数上（滚得太勤会每帧
 * 抖动，滚得太少当前句会飘出视野）。
 *
 * 两条路各自的落点不同，不要合并：
 *   · 桌面 —— 只滚右侧内层字幕列表，把当前句**居中**；判定用「偏离中心超过半句高」。
 *   · 移动端 —— 滚的是壳的页级滚动容器，把当前句顶边停在**画框下沿 + 8px**；
 *     判定用「偏离超过 24px」（约一行）。
 */

/** 移动端落点：当前句条目顶边停在画框下沿往下这么多像素处。 */
export const MOBILE_FOLLOW_GAP = 8;

/** 移动端容差：偏离在一行以内就不滚，避免每次 timeUpdate 都抖动。 */
export const MOBILE_FOLLOW_TOLERANCE = 24;

/**
 * 移动端：把当前句顶边对到 `frameBottom + gap` 需要滚多少（正值 = 往下滚）。
 * 已经在容差内则返回 `null` —— 调用方据此跳过 `scrollBy`。
 */
export function mobileFollowScroll(entryTop: number, frameBottom: number): number | null {
  const delta = entryTop - (frameBottom + MOBILE_FOLLOW_GAP);
  return Math.abs(delta) > MOBILE_FOLLOW_TOLERANCE ? delta : null;
}

/** 一个盒子：`top` 来自 `getBoundingClientRect()`，`height` 是该盒子自己报的高度。 */
export interface FollowBox {
  top: number;
  height: number;
}

/**
 * 桌面：把当前句居中所需的偏移。`height` 用 `clientHeight` 而不是 rect 高度 ——
 * 与拆分前一致（列表项没有边框，两者数值相同，但口径只保留一个）。
 */
export function desktopFollowOffset(entry: FollowBox, container: FollowBox): number {
  return entry.top - container.top - (container.height / 2 - entry.height / 2);
}

/**
 * 桌面：偏离容器中心超过**半句高**才滚，否则返回 `null`（同样是为了不抖动）。
 */
export function desktopFollowScroll(entry: FollowBox, container: FollowBox): number | null {
  const offset = desktopFollowOffset(entry, container);
  return Math.abs(offset) > entry.height / 2 ? offset : null;
}
