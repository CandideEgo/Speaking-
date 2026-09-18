"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { VocabSet } from "@/types";

interface UseVocabSetsReturn {
  sets: VocabSet[];
  loading: boolean;
  error: string | null;
  /** Re-fetch the list (e.g. after creating a set from the watch page). */
  refresh: () => void;
}

/**
 * 视频词汇集合列表（词汇页「视频集合」tab）：
 * GET /api/v1/vocab-sets。后端已按未完成优先排序，前端原样渲染。
 */
export function useVocabSets(enabled: boolean): UseVocabSetsReturn {
  const [sets, setSets] = useState<VocabSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api<VocabSet[]>("/api/v1/vocab-sets", { signal: controller.signal })
      .then((data) => {
        setSets(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "加载失败");
        setSets([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  return { sets, loading, error, refresh };
}
