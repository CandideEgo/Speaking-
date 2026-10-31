/**
 * 有效学习时长累加器（A02 / FE-02）。
 *
 * ## 口径（v2，2026-10-29 起生效）
 *
 * **有效学习秒数 = 媒体处于播放状态、且页面可见的墙钟秒数。**
 * - 拖动（seek）不计：位置跳变不是学习时间。
 * - 暂停、切到后台标签页、页面隐藏都不计。
 * - 倍速**不**乘系数：2× 重听一秒仍是 1 秒注意力。
 * - 循环重听正常累计；9 秒就离开也会保留尾段。
 *
 * ## 为什么换掉 v1
 *
 * v1（`currentTime - wtLastPos`）把「媒体位置差」当成学习时间，三个方向都错：
 * 拖到 120 秒会一次记 60 秒；5 秒片段听 20 秒记 0；看 9 秒离开记 0。后两者正好
 * 打掉逐句重听与碎片学习这两个核心场景。v1 的历史数据与新口径不可比，不能拼在
 * 同一条曲线上解释。
 *
 * ## 纯函数
 *
 * `updateWatchTime` 不读时钟、不读 DOM：`nowMs` 与 `visible` 由调用方注入，因此
 * 边界情形（暂停、隐藏、换视频、超长间隔）都能在单测里确定性地覆盖。
 */

/** 事件协议版本，落在 watch_time 的 payload 里，用于区分 v1 历史数据。 */
export const WATCH_TIME_SCHEMA_VERSION = 2;

/** 累计到这个秒数就上报一次（正常情况下每个事件约 10 秒）。 */
export const REPORT_INTERVAL_SECONDS = 10;

/** 暂停/隐藏/离页时的尾段：达到这个值就补报，避免「看了 9 秒算 0」。 */
export const MIN_FLUSH_SECONDS = 0.5;

/**
 * 单段累计的上限。正常情况下调用方每秒喂一次，段长远小于此值；上限只用于
 * 兜住异常间隔（休眠、时钟跳变），避免一次结算把几小时记成学习时间。
 */
export const MAX_SEGMENT_SECONDS = 60;

export interface WatchTimeState {
  videoId: string | null;
  /** 单调时钟（毫秒）上本段开始累计的时刻；null 表示当前没有在累计。 */
  runningSinceMs: number | null;
  /** 已结算、尚未上报的秒数。 */
  pendingSeconds: number;
}

export interface WatchTimeInput {
  videoId: string;
  /** 播放器是否处于播放状态。 */
  playing: boolean;
  /** `document.visibilityState === "visible"`。 */
  visible: boolean;
  /** 单调时钟毫秒。 */
  nowMs: number;
}

export interface WatchTimeReport {
  videoId: string;
  deltaSeconds: number;
}

export interface WatchTimeResult {
  state: WatchTimeState;
  /** 非 null 时调用方应发一条 watch_time 事件。 */
  report: WatchTimeReport | null;
}

export function createWatchTimeState(): WatchTimeState {
  return { videoId: null, runningSinceMs: null, pendingSeconds: 0 };
}

/** 把当前段结算进 pending；`keepRunning` 决定结算后是否立刻开启新段。 */
function settle(state: WatchTimeState, nowMs: number, keepRunning: boolean): WatchTimeState {
  if (state.runningSinceMs === null) {
    return keepRunning ? { ...state, runningSinceMs: nowMs } : state;
  }
  const raw = (nowMs - state.runningSinceMs) / 1000;
  const segment = Math.min(Math.max(raw, 0), MAX_SEGMENT_SECONDS);
  return {
    ...state,
    pendingSeconds: state.pendingSeconds + segment,
    runningSinceMs: keepRunning ? nowMs : null,
  };
}

function makeReport(state: WatchTimeState): WatchTimeReport | null {
  if (!state.videoId || state.pendingSeconds < MIN_FLUSH_SECONDS) return null;
  const rounded = Math.round(state.pendingSeconds * 10) / 10;
  return rounded > 0 ? { videoId: state.videoId, deltaSeconds: rounded } : null;
}

/**
 * 喂入一次播放状态。调用方应在播放状态变化时立即调用，并在播放期间保持心跳
 * （每秒一次即可）；`playing` 变 false 的那一次会结算并补报尾段。
 */
export function updateWatchTime(state: WatchTimeState, input: WatchTimeInput): WatchTimeResult {
  const { videoId, playing, visible, nowMs } = input;

  // 换视频：先把上一个视频的尾段报掉，再从头累计新的。
  if (state.videoId !== videoId) {
    const settled = settle(state, nowMs, false);
    const report = makeReport(settled);
    const next: WatchTimeState = {
      videoId,
      runningSinceMs: playing && visible ? nowMs : null,
      pendingSeconds: 0,
    };
    return { state: next, report };
  }

  const shouldRun = playing && visible;
  let next: WatchTimeState;

  if (shouldRun) {
    next = settle(state, nowMs, true);
  } else {
    // 停止（暂停 / 隐藏）：结算并关段，下面的 flush 会把尾段报出去。
    next = settle(state, nowMs, false);
  }

  const stopped = !shouldRun;
  const due =
    next.pendingSeconds >= REPORT_INTERVAL_SECONDS ||
    (stopped && next.pendingSeconds >= MIN_FLUSH_SECONDS);
  if (!due) return { state: next, report: null };

  const report = makeReport(next);
  if (!report) return { state: next, report: null };
  return { state: { ...next, pendingSeconds: 0 }, report };
}

/** 离页 / 卸载：结算当前段并强制上报尾段。 */
export function flushWatchTime(state: WatchTimeState, nowMs: number): WatchTimeResult {
  if (!state.videoId) return { state, report: null };
  const settled = settle(state, nowMs, false);
  const report = makeReport(settled);
  if (!report) return { state: settled, report: null };
  return { state: { ...settled, pendingSeconds: 0 }, report };
}
