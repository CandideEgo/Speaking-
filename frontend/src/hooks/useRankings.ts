"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { RankedVideo } from "@/types";

export type RankingScope = "latest" | "weekly_views" | "weekly_favorites";

interface UseRankingsReturn {
  items: RankedVideo[];
  loading: boolean;
  error: string | null;
}

/**
 * 排行数据（首页排行块与 /rankings 页共用）：
 * GET /api/v1/videos/rankings?scope=...（后端最多返回 20 条）。
 * scope 切换时重新请求，并中断尚未完成的旧请求。
 */
export function useRankings(scope: RankingScope): UseRankingsReturn {
  const [items, setItems] = useState<RankedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api<RankedVideo[]>(`/api/v1/videos/rankings?scope=${scope}`, { signal: controller.signal })
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "加载失败");
        setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope]);

  return { items, loading, error };
}
