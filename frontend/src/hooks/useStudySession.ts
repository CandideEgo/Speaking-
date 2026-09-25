"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StudySession, StudySessionItem, TodayTrainingSummary } from "@/types";

interface SessionEnvelope {
  session: StudySession | null;
  today: TodayTrainingSummary;
}

interface AnswerResponse {
  item: StudySessionItem;
  session_id: string;
  done_count: number;
  correct_count: number;
  target_count: number;
  session_status: StudySession["status"];
  graduated: boolean;
  today: TodayTrainingSummary;
}

const EMPTY_TODAY: TodayTrainingSummary = { words_learned: 0, rounds: 0 };

/**
 * 一轮训练的服务端状态（DEC-053）。
 *
 * 挂载时先查「今日未完成的一轮」，有就续上；没有则按配额开一轮
 * （`autoStart`）。`POST /vocabulary/sessions` 在服务端是幂等的——同一轮
 * 已存在时原样返回——所以 StrictMode 的重复挂载不会开出两轮。
 *
 * 一次作答只走这一个端点：它同时更新词在本轮的连对计数和词自身的 SM-2
 * 状态，并（首次作答该词时）发出学习事件，让今日累计真的长起来。
 */
export function useStudySession(enabled: boolean, autoStart: "daily" | null = "daily") {
  const [round, setRound] = useState<StudySession | null>(null);
  const [today, setToday] = useState<TodayTrainingSummary>(EMPTY_TODAY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const current = await api<SessionEnvelope>("/api/v1/vocabulary/sessions/current");
      if (current.session || !autoStart) {
        setRound(current.session);
        setToday(current.today ?? EMPTY_TODAY);
        return;
      }
      const started = await api<SessionEnvelope>("/api/v1/vocabulary/sessions", {
        method: "POST",
        body: JSON.stringify({ kind: autoStart }),
      });
      setRound(started.session);
      setToday(started.today ?? EMPTY_TODAY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [enabled, autoStart]);

  useEffect(() => {
    load();
  }, [load]);

  /** 开一轮（加练用；服务端在当前轮未结束时返回当前轮本身）。 */
  const start = useCallback(async (kind: "daily" | "extra") => {
    const started = await api<SessionEnvelope>("/api/v1/vocabulary/sessions", {
      method: "POST",
      body: JSON.stringify({ kind }),
    });
    setRound(started.session);
    setToday(started.today ?? EMPTY_TODAY);
    return started.session;
  }, []);

  /** 记录一轮里的一次作答。返回更新后的项与今日累计。 */
  const answer = useCallback(
    async (vocabularyId: string, correct: boolean) => {
      if (!round) return null;
      const res = await api<AnswerResponse>(`/api/v1/vocabulary/sessions/${round.id}/answer`, {
        method: "POST",
        body: JSON.stringify({ vocabulary_id: vocabularyId, correct }),
      });
      setToday(res.today ?? EMPTY_TODAY);
      return res;
    },
    [round]
  );

  /** 结束当前轮（加练前调用：后端在同一个事务里清掉 30 天前的轮次明细）。 */
  const finish = useCallback(async () => {
    if (!round) return;
    await api(`/api/v1/vocabulary/sessions/${round.id}/finish`, { method: "POST" });
  }, [round]);

  return { round, today, loading, error, reload: load, start, answer, finish };
}
