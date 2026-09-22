"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { VocabularyWord } from "@/types";

export interface DailySessionTotals {
  new_total: number;
  due_total: number;
}

export interface DailySession {
  newWords: VocabularyWord[];
  reviewWords: VocabularyWord[];
  totals: DailySessionTotals;
}

/**
 * GET /api/v1/vocabulary/daily-session — 今日训练队列（新词 + 到期复习词）。
 * 供 /vocabulary 首页 Hero 与 /vocabulary/drill 两段式训练流程使用。
 */
export function useDailySession(enabled: boolean) {
  const [session, setSession] = useState<DailySession | null>(null);
  const [loading, setLoading] = useState(true);
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
      }>("/api/v1/vocabulary/daily-session");
      setSession({
        newWords: data.new_words ?? [],
        reviewWords: data.review_words ?? [],
        totals: data.totals ?? { new_total: 0, due_total: 0 },
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
