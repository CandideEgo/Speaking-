/**
 * Web Vitals（A12 / FE-05）——LCP、INP、CLS 的纯累加器。
 *
 * 与 `watchTime.ts` 同一种做法：不读时钟、不读 DOM，浏览器观察器把条目喂进来，
 * 单测可以确定性地覆盖「会话窗口切分」「增量合并」「没有样本」这些边界。
 * 上报在 `analytics.ts`（走 behavior_events，event_type = web_vital），不另建表。
 *
 * 口径：
 * - **LCP**：最后一次 `largest-contentful-paint` 条目的 startTime（毫秒）。
 * - **INP**：所有交互事件条目里最长的 duration（毫秒）。这里取「最长交互」而
 *   不是严格的第 98 百分位——样本少时 p98 没有意义，且与后台 p75 的聚合口径
 *   分开记录（后台取总体 p75，单条事件记本次最大值）。
 * - **CLS**：会话窗口内的布局偏移之和的最大值。窗口规则：相邻偏移间隔 > 1s 或
 *   距窗口首个偏移 > 5s 即开新窗口；`hadRecentInput` 的偏移不计。
 */

export type VitalName = "lcp" | "inp" | "cls";

/** 上报契约版本；与 `analytics.ts` 的 EVENT_SCHEMA_VERSION 同步。 */
export const WEB_VITAL_SCHEMA_VERSION = 2;

export const CLS_SESSION_GAP_MS = 1000;
export const CLS_SESSION_MAX_MS = 5000;

export interface LayoutShiftSample {
  /** 偏移发生的时间（毫秒，相对 navigation start）。 */
  startTime: number;
  /** 偏移量（0..1）。 */
  value: number;
  /** 用户刚有输入的偏移不计入 CLS。 */
  hadRecentInput: boolean;
}

export interface VitalsState {
  lcp: number | null;
  inp: number | null;
  /** 当前 CLS 会话窗口的起始时间。 */
  clsWindowStart: number | null;
  /** 当前窗口内最后一次偏移的时间（用于 1s 间隔规则）。 */
  clsLastShiftTime: number | null;
  /** 当前窗口内累计的偏移量。 */
  clsWindowValue: number;
  /** 已结束窗口里最大的偏移量。 */
  clsMax: number;
}

export function createVitalsState(): VitalsState {
  return {
    lcp: null,
    inp: null,
    clsWindowStart: null,
    clsLastShiftTime: null,
    clsWindowValue: 0,
    clsMax: 0,
  };
}

export function recordLcp(state: VitalsState, startTime: number): VitalsState {
  if (!Number.isFinite(startTime) || startTime < 0) return state;
  return { ...state, lcp: startTime };
}

export function recordInp(state: VitalsState, durationMs: number): VitalsState {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return state;
  const next = state.inp === null ? durationMs : Math.max(state.inp, durationMs);
  return next === state.inp ? state : { ...state, inp: next };
}

export function recordLayoutShift(state: VitalsState, sample: LayoutShiftSample): VitalsState {
  if (sample.hadRecentInput) return state;
  if (!Number.isFinite(sample.value) || sample.value <= 0) return state;

  const windowStart = state.clsWindowStart;
  const inSameWindow =
    windowStart !== null &&
    state.clsLastShiftTime !== null &&
    sample.startTime - windowStart <= CLS_SESSION_MAX_MS &&
    sample.startTime - state.clsLastShiftTime <= CLS_SESSION_GAP_MS &&
    state.clsWindowValue > 0;

  if (!inSameWindow) {
    // 上一窗口结束：把它与已记录的窗口最大值比较后再开新窗口。
    return {
      ...state,
      clsWindowStart: sample.startTime,
      clsLastShiftTime: sample.startTime,
      clsWindowValue: sample.value,
      clsMax: Math.max(state.clsMax, state.clsWindowValue),
    };
  }

  return {
    ...state,
    clsLastShiftTime: sample.startTime,
    clsWindowValue: state.clsWindowValue + sample.value,
    clsMax: Math.max(state.clsMax, state.clsWindowValue + sample.value),
  };
}

export interface VitalReport {
  metric: VitalName;
  value: number;
}

/** 只返回已有样本的指标：没有 CLS 偏移就是「没有样本」，不是 0。 */
export function vitalReports(state: VitalsState): VitalReport[] {
  const reports: VitalReport[] = [];
  if (state.lcp !== null) reports.push({ metric: "lcp", value: Math.round(state.lcp) });
  if (state.inp !== null) reports.push({ metric: "inp", value: Math.round(state.inp) });
  if (state.clsMax > 0)
    reports.push({ metric: "cls", value: Math.round(state.clsMax * 1000) / 1000 });
  return reports;
}
