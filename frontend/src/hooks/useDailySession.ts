"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TodayTrainingSummary, VocabularyPreferences, VocabularyWord } from "@/types";

export interface DailySessionTotals {
  new_total: number;
  due_total: number;
}

export interface DailySession {
  newWords: VocabularyWord[];
  reviewWords: VocabularyWord[];
  totals: DailySessionTotals;
  /** 每日配额（DEC-053）：今日 tab 的配额选择器读这里。 */
  preferences: VocabularyPreferences | null;
  /** 今日累计已学（含加练）+ 已开始的轮数。 */
  today: TodayTrainingSummary;
}

/**
 * GET /api/v1/vocabulary/daily-session — 今日训练队列（新词 + 到期复习词）。
 * 供 /vocabulary 首页 Hero 与 /vocabulary/drill 两段式训练流程使用。
 *
 * 队列长度由后端按用户配额决定（默认 10 新词），前端不再传死数字。
 */
export function useDailySession(enabled: boolean) {
  const [session, setSession] = useState<DailySession | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<{
        new_words: VocabularyWord[];
        review_words: VocabularyWord[];
        totals: DailySessionTotals;
        preferences?: VocabularyPreferences;
        today?: TodayTrainingSummary;
      }>("/api/v1/vocabulary/daily-session");
      setSession({
        newWords: data.new_words ?? [],
        reviewWords: data.review_words ?? [],
        totals: data.totals ?? { new_total: 0, due_total: 0 },
        preferences: data.preferences ?? null,
        today: data.today ?? { words_learned: 0, rounds: 0 },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { session, loading, error, refresh };
}
