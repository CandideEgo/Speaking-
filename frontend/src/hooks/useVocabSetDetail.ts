"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { VocabSetDetail, VocabSetScope } from "@/types";

interface UseVocabSetDetailReturn {
  detail: VocabSetDetail | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch the detail (error retry). */
  reload: () => void;
}

/**
 * 集合详情（集合页）：GET /api/v1/vocab-sets/{id}?scope=...。
 * scope 切换（全部/未掌握/学习中）时重新请求，并中断尚未完成的旧请求。
 */
export function useVocabSetDetail(
  setId: string,
  scope: VocabSetScope,
  enabled: boolean
): UseVocabSetDetailReturn {
  const [detail, setDetail] = useState<VocabSetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api<VocabSetDetail>(`/api/v1/vocab-sets/${setId}?scope=${scope}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setDetail(data);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "加载失败");
        setDetail(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [setId, scope, enabled, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { detail, loading, error, reload };
}
