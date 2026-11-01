"use client";

/**
 * P0 behavior collection (ADR-0011). Buffers interaction events in memory,
 * flushes every 5s via POST /behavior/events/batch, and on page hide via
 * fetch keepalive (survives unload). Anonymous events allowed — logged-in
 * users get user_id attached server-side via the JWT.
 *
 * Side-effects (time_spent_seconds / completed / view_count) are mirrored onto
 * LearningRecord/Video by behavior_service on ingest.
 */
import { api, getApiUrl } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import {
  WATCH_TIME_SCHEMA_VERSION,
  createWatchTimeState,
  flushWatchTime,
  updateWatchTime,
  type WatchTimeReport,
  type WatchTimeState,
} from "@/lib/watchTime";
import {
  WEB_VITAL_SCHEMA_VERSION,
  createVitalsState,
  recordInp,
  recordLayoutShift,
  recordLcp,
  vitalReports,
  type VitalsState,
} from "@/lib/webVitals";

/**
 * 行为事件契约版本（A12）。镜像 `backend/app/services/event_contract.py` 的
 * `BEHAVIOR_EVENT_SCHEMA_VERSION`——前端不能 import 后端模块，两边的对齐靠
 * 这个常量与 `analytics.test.ts` 的契约断言。改版本必须同时改两处。
 */
export const EVENT_SCHEMA_VERSION = 3;

interface BehaviorEvent {
  /** 客户端生成的事件 id：服务端按它去重，重发/重试不会重复累计学习时长。 */
  event_id: string;
  video_id?: string;
  event_type: string;
  event_payload?: Record<string, unknown>;
  session_id?: string;
  /** A12：一次学习流程的 id，与服务端会话 id / 学习事件的 flow_id 同值。 */
  flow_id?: string;
  /** 上报契约版本（服务端拒绝高于自己版本的事件）。 */
  schema_version: number;
  client_ts?: number;
}

const QUEUE: BehaviorEvent[] = [];
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE = 20;
// Ceiling on the retained queue after a failed batch. Bounds memory when the
// ingest endpoint is unreachable; normal batches stay far below it.
const MAX_RETAINED_QUEUE = 200;

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
const SESSION_ID = makeSessionId();

function makeEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let flushTimer: ReturnType<typeof setInterval> | null = null;
// A second batch sent while the first is pending can land before the older
// re-queued events, reordering them server-side.
let isFlushing = false;

function ensureTimer(): void {
  if (flushTimer || typeof window === "undefined") return;
  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  // Single source of truth: read from authStore (not raw localStorage).
  // AuthInitializer runs in the root layout before any user interaction, so
  // the store is populated by the time events fire.
  return useAuthStore.getState().token;
}

export function track(
  eventType: string,
  payload: Record<string, unknown> = {},
  videoId?: string,
  flowId?: string
): void {
  if (typeof window === "undefined") return;
  QUEUE.push({
    event_id: makeEventId(),
    video_id: videoId,
    event_type: eventType,
    event_payload: payload,
    session_id: SESSION_ID,
    flow_id: flowId,
    schema_version: EVENT_SCHEMA_VERSION,
    client_ts: Date.now(),
  });
  ensureTimer();
  if (QUEUE.length >= MAX_QUEUE) void flush();
}

export async function flush(): Promise<void> {
  if (isFlushing || QUEUE.length === 0) return;
  isFlushing = true;
  const events = QUEUE.splice(0, QUEUE.length);
  try {
    await api("/api/v1/behavior/events/batch", {
      method: "POST",
      body: JSON.stringify({ events }),
    });
  } catch {
    // Re-queue the whole batch, order preserved, so nothing is dropped silently.
    QUEUE.unshift(...events);
    if (QUEUE.length > MAX_RETAINED_QUEUE) QUEUE.length = MAX_RETAINED_QUEUE;
  } finally {
    isFlushing = false;
  }
}

function flushBeacon(): void {
  if (QUEUE.length === 0) return;
  const events = QUEUE.splice(0, QUEUE.length);
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    void fetch(`${getApiUrl()}/api/v1/behavior/events/batch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ events }),
      keepalive: true,
    });
  } catch {
    // Best-effort — drop on failure
  }
}

// ---------------------------------------------------------------------------
// 有效学习时长（A02 / FE-02）
// ---------------------------------------------------------------------------
//
// 口径与边界在 `lib/watchTime.ts`（纯函数，有单测）。这里只做三件事：
// 注入真实时钟与可见性、把结算结果排进上报队列、在离页时冲刷。

let watchState: WatchTimeState = createWatchTimeState();

function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function pageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function emitWatchReport(report: WatchTimeReport | null): void {
  if (!report) return;
  track(
    "watch_time",
    { delta_s: report.deltaSeconds, v: WATCH_TIME_SCHEMA_VERSION },
    report.videoId
  );
}

/**
 * 喂一次播放状态。播放期间按秒调用即可（每次调用都很便宜，只有攒够 10 秒
 * 或播放停下时才产生一条事件）；`playing` 变 false 的那一次会结算尾段。
 */
export function trackWatchTime(videoId: string, playing: boolean): void {
  if (typeof window === "undefined") return;
  const result = updateWatchTime(watchState, {
    videoId,
    playing,
    visible: pageVisible(),
    nowMs: monotonicNow(),
  });
  watchState = result.state;
  emitWatchReport(result.report);
}

/** 离开观看页：结算并冲刷尾段。 */
export function endWatchTime(): void {
  if (typeof window === "undefined") return;
  const result = flushWatchTime(watchState, monotonicNow());
  watchState = result.state;
  emitWatchReport(result.report);
}

export function trackClick(videoId: string, source: string): void {
  track("click", { source }, videoId);
}

// ---------------------------------------------------------------------------
// A12 学习 flow 关联与 RUM
// ---------------------------------------------------------------------------

export function newFlowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 流程开始（意图，只用于路径分析）；`path` 取 listening/exam/practice/vocabulary。 */
export function trackFlowStart(path: string, flowId: string): void {
  track("flow_start", { path, v: EVENT_SCHEMA_VERSION }, undefined, flowId);
}

/**
 * 流程提交成功后的客户端意图。服务端同一 flow_id 会落一条学习事件
 * （LearningEvent.flow_id），两者对不上就是丢失或重复，见管理端事件质量。
 */
export function trackFlowResult(
  path: string,
  flowId: string,
  extra: Record<string, unknown> = {}
): void {
  track("flow_result", { path, v: EVENT_SCHEMA_VERSION, ...extra }, undefined, flowId);
}

/** 观看页第一次真正出画（playing）到页面开始加载的耗时。 */
export function trackFirstPlay(ms: number, videoId?: string): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  track("first_play", { ms: Math.round(ms), v: EVENT_SCHEMA_VERSION }, videoId);
}

// ---------------------------------------------------------------------------
// 词卡会话（A14 单项实验）
// ---------------------------------------------------------------------------
//
// 口径镜像 `backend/app/services/event_contract.py` 的 `CLIENT_GLOSS_OPEN` /
// `CLIENT_REPLAY` / `GLOSS_REPLAY_WINDOW_SECONDS`。主指标是「查词后 10 秒内
// 回到同一句并重听」的比例，按同一个 `flow_id` 把两条事件配对即可算出。

/** 词卡会话与重听配对的时间窗（毫秒）。改动必须同步后端的秒数常量。 */
export const GLOSS_REPLAY_WINDOW_MS = 10_000;

export interface GlossLink {
  flowId: string;
  sentenceIndex: number | null;
  at: number;
}

/**
 * 一次重听是否算作「回到刚才那次查词的原句」——窗口期内且同一句。
 * 任一侧句号未知（null）时不据此否决，宁可配对也不把窗口边缘丢掉。
 */
export function matchesGlossLink(
  link: GlossLink | null,
  sentenceIndex: number | null,
  now: number
): boolean {
  if (!link) return false;
  if (now - link.at > GLOSS_REPLAY_WINDOW_MS) return false;
  if (
    link.sentenceIndex !== null &&
    sentenceIndex !== null &&
    link.sentenceIndex !== sentenceIndex
  ) {
    return false;
  }
  return true;
}

// 最近一次词卡会话放在模块级，而不是词卡 hook 的 ref：词卡开着时页面可能重排
// 甚至重挂载，ref 会随之丢掉，配对窗口就静默失效、主指标被系统性低估。
let lastGlossLink: GlossLink | null = null;

/**
 * 词卡打开。`flowId` 是本次词卡会话自己的 id，不是学习流程的会话 id。
 * 同时记住这次会话，供 10 秒内的 `replay` 配对。
 */
export function trackGlossOpen(
  videoId: string | undefined,
  flowId: string,
  sentenceIndex: number | null,
  extra: Record<string, unknown> = {}
): void {
  lastGlossLink = { flowId, sentenceIndex, at: Date.now() };
  track(
    "gloss_open",
    { v: EVENT_SCHEMA_VERSION, sentence_index: sentenceIndex, ...extra },
    videoId,
    flowId
  );
}

/** 这次重听该带的词卡 `flow_id`；不在窗口内或不同句时返回 undefined。 */
export function glossFlowForReplay(sentenceIndex: number | null): string | undefined {
  return matchesGlossLink(lastGlossLink, sentenceIndex, Date.now())
    ? lastGlossLink?.flowId
    : undefined;
}

/** 仅测试用：清掉模块级记忆，避免用例互相污染。 */
export function resetGlossLink(): void {
  lastGlossLink = null;
}

/**
 * 原句重听。带 `flowId` 表示它落在那次查词的窗口内（同一句），不带则是
 * 普通的逐句重听——两者分开计数，避免把日常重听算成实验效果。
 */
export function trackReplay(
  videoId: string | undefined,
  flowId: string | undefined,
  extra: Record<string, unknown> = {}
): void {
  track("replay", { v: EVENT_SCHEMA_VERSION, ...extra }, videoId, flowId);
}

let vitalsState: VitalsState = createVitalsState();
let vitalsObserverStarted = false;
let vitalsReported = false;

function startVitalsObservers(): void {
  if (vitalsObserverStarted || typeof window === "undefined") return;
  if (typeof PerformanceObserver === "undefined") return;
  vitalsObserverStarted = true;
  const observe = (
    type: string,
    onEntry: (entry: PerformanceEntry) => void,
    extra?: PerformanceObserverInit
  ) => {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) onEntry(entry);
      });
      observer.observe({ type, buffered: true, ...extra });
    } catch {
      // Unsupported entry type in this browser: the metric simply has no sample.
    }
  };
  observe("largest-contentful-paint", (entry) => {
    vitalsState = recordLcp(vitalsState, entry.startTime);
  });
  observe("layout-shift", (entry) => {
    const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
    vitalsState = recordLayoutShift(vitalsState, {
      startTime: entry.startTime,
      value: shift.value ?? 0,
      hadRecentInput: shift.hadRecentInput ?? false,
    });
  });
  observe(
    "event",
    (entry) => {
      const timing = entry as PerformanceEntry & { duration?: number };
      vitalsState = recordInp(vitalsState, timing.duration ?? 0);
    },
    { durationThreshold: 40 } as PerformanceObserverInit
  );
}

/** 离页/隐藏时上报一次；重复调用不会重复上报。 */
export function reportWebVitals(): void {
  if (vitalsReported) return;
  vitalsReported = true;
  const path = typeof location !== "undefined" ? location.pathname : undefined;
  for (const report of vitalReports(vitalsState)) {
    track("web_vital", {
      metric: report.metric,
      value: report.value,
      v: WEB_VITAL_SCHEMA_VERSION,
      path,
    });
  }
}

// ---------------------------------------------------------------------------
// 模块加载即生效的副作用
// ---------------------------------------------------------------------------
//
// 必须留在文件末尾：它读 `watchState` 与 `vitalsState` 等模块级 `let`，放在
// 声明之前会命中 TDZ。开发构建把它当普通 import 求值，压榨后的生产包则会
// 直接抛 `ReferenceError: Cannot access 'x' before initialization`，整页进错误
// 边界——A11 的生产 smoke 才暴露出来，单测与 typecheck 都看不见。

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // 先结算学习时长再冲刷：切到后台的那一刻正是尾段最容易被丢掉的时刻。
      endWatchTime();
      reportWebVitals();
      flushBeacon();
    }
  });
  window.addEventListener("pagehide", () => {
    endWatchTime();
    reportWebVitals();
    flushBeacon();
  });
  startVitalsObservers();
}
