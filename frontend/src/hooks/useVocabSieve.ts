"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { VocabSieveState } from "@/types";

interface UseVocabSieveReturn {
  state: VocabSieveState | null;
  loading: boolean;
  error: string | null;
  /** True while a judge POST + state refetch is in flight. */
  judging: boolean;
  /**
   * 判定当前单词并推进：POST {known} 后重新拉取筛词状态。
   * 服务端为唯一事实来源（completed / sieved_count / 下一个词），
   * 因此刷新或中途退出后可无损续筛。返回更新后的状态；
   * 网络失败抛错（由调用方 toast），重复触发静默返回 null。
   */
  judge: (known: boolean) => Promise<VocabSieveState | null>;
  /**
   * 把待学清单里的词标记为已掌握（闭环终点，需求 §4.5）：
   * POST .../words/{id}/learned 后重新拉取状态。
   */
  markLearned: (setWordId: string) => Promise<VocabSieveState | null>;
  /** Re-fetch the current sieve state (e.g. retry after error). */
  reload: () => void;
}

/**
 * 快速过筛（集合页 → /sieve）：GET /api/v1/vocab-sets/{id}/sieve。
 * 初始加载 + judge 后均重新拉取，断点续筛由服务端驱动。
 */
export function useVocabSieve(setId: string, enabled: boolean): UseVocabSieveReturn {
  const [state, setState] = useState<VocabSieveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [judging, setJudging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // judge 读取最新 state / judging，经 ref 桥接保持回调引用稳定。
  const stateRef = useRef(state);
  const judgingRef = useRef(judging);
  stateRef.current = state;
  judgingRef.current = judging;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api<VocabSieveState>(`/api/v1/vocab-sets/${setId}/sieve`, { signal: controller.signal })
      .then((data) => {
        setState(data);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [setId, enabled, reloadKey]);

  const judge = useCallback(
    async (known: boolean): Promise<VocabSieveState | null> => {
      const current = stateRef.current;
      if (!current?.set_word_id || judgingRef.current) return null;
      judgingRef.current = true;
      setJudging(true);
      try {
        await api(`/api/v1/vocab-sets/${setId}/words/${current.set_word_id}/sieve`, {
          method: "POST",
          body: JSON.stringify({ known }),
        });
        const next = await api<VocabSieveState>(`/api/v1/vocab-sets/${setId}/sieve`);
        setState(next);
        return next;
      } finally {
        judgingRef.current = false;
        setJudging(false);
      }
    },
    [setId]
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const markLearned = useCallback(
    async (setWordId: string): Promise<VocabSieveState | null> => {
      if (judgingRef.current) return null;
      judgingRef.current = true;
      setJudging(true);
      try {
        await api(`/api/v1/vocab-sets/${setId}/words/${setWordId}/learned`, { method: "POST" });
        const next = await api<VocabSieveState>(`/api/v1/vocab-sets/${setId}/sieve`);
        setState(next);
        return next;
      } finally {
        judgingRef.current = false;
        setJudging(false);
      }
    },
    [setId]
  );

  return { state, loading, error, judging, judge, markLearned, reload };
}
