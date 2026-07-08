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

interface BehaviorEvent {
  video_id?: string;
  event_type: string;
  event_payload?: Record<string, unknown>;
  session_id?: string;
  client_ts?: number;
}

const QUEUE: BehaviorEvent[] = [];
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE = 20;

function makeSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
const SESSION_ID = makeSessionId();

let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureTimer(): void {
  if (flushTimer || typeof window === "undefined") return;
  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("seeword_token");
}

export function track(
  eventType: string,
  payload: Record<string, unknown> = {},
  videoId?: string,
): void {
  if (typeof window === "undefined") return;
  QUEUE.push({
    video_id: videoId,
    event_type: eventType,
    event_payload: payload,
    session_id: SESSION_ID,
    client_ts: Date.now(),
  });
  ensureTimer();
  if (QUEUE.length >= MAX_QUEUE) void flush();
}

export async function flush(): Promise<void> {
  if (QUEUE.length === 0) return;
  const events = QUEUE.splice(0, QUEUE.length);
  try {
    await api("/api/v1/behavior/events/batch", {
      method: "POST",
      body: JSON.stringify({ events }),
    });
  } catch {
    // Re-queue on failure, cap to avoid unbounded growth
    QUEUE.unshift(...events.slice(0, 50));
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

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });
  window.addEventListener("pagehide", flushBeacon);
}

// --- Watch-time accumulator (called from <video> onTimeUpdate) ---
// Emits a `watch_time` event every 10s with the delta since the last report.
// Delta is clamped to [0, 60] so a seek doesn't emit a huge spike.
let wtVideoId: string | null = null;
let wtLastReportTs = 0;
let wtLastPos = 0;

export function trackWatchTime(videoId: string, currentTime: number): void {
  if (wtVideoId !== videoId) {
    wtVideoId = videoId;
    wtLastReportTs = Date.now();
    wtLastPos = currentTime;
    return;
  }
  const now = Date.now();
  if (now - wtLastReportTs >= 10000) {
    const delta_s = Math.min(60, Math.max(0, currentTime - wtLastPos));
    if (delta_s > 0.5) {
      track("watch_time", { delta_s: Math.round(delta_s * 10) / 10 }, videoId);
    }
    wtLastReportTs = now;
    wtLastPos = currentTime;
  }
}

export function trackClick(videoId: string, source: string): void {
  track("click", { source }, videoId);
}
