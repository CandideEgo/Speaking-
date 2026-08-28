"use client";

/**
 * useUnlockedIds — Free 视角的视频解锁状态（D0 解锁制）。
 *
 * 一次拉取 /videos/unlocked-ids（已解锁 id 集合 + 本月剩余额度），
 * 供卡片网格计算三态角标：
 *   - unlocked：已解锁 / Pro / 示范视频 → "✓"
 *   - locked：未解锁且有剩余次数 → 锁图标
 *   - exhausted：未解锁且本月次数用完 → 锁图标 + 灰度
 *
 * Pro 用户与加载中返回 null —— 调用方不渲染任何锁标。
 */

import { useEffect, useMemo, useState } from "react";
import { api, isProUser } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

export type LockState = "unlocked" | "locked" | "exhausted";

interface UnlockedIdsResponse {
  video_ids: string[];
  remaining_this_month: number | null;
  quota: number;
}

export interface UnlockedInfo {
  remaining: number;
  quota: number;
  /** 按视频数据计算角标状态（is_demo 恒为 unlocked）。 */
  lockStateFor: (video: { id?: string; video_id?: string; is_demo?: boolean }) => LockState;
}

export function useUnlockedIds(): UnlockedInfo | null {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [me, setMe] = useState<{ plan: string; plan_expires_at: string | null } | null>(null);
  const [data, setData] = useState<UnlockedIdsResponse | null>(null);

  // JWT 里不含 plan，需从 /users/me 拿（与 isProUser 的入参一致）。
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    let cancelled = false;
    api<{ plan: string; plan_expires_at: string | null }>("/api/v1/users/me")
      .then((u) => {
        if (!cancelled) setMe(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated]);

  const isPro = isProUser(me);

  useEffect(() => {
    if (isLoading || !isAuthenticated || isPro) return;
    let cancelled = false;
    api<UnlockedIdsResponse>("/api/v1/videos/unlocked-ids")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        /* 拉取失败不阻塞列表渲染，角标退化为不显示 */
      });
    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated, isPro]);

  return useMemo(() => {
    if (isPro || !isAuthenticated || !data) return null;
    const ids = new Set(data.video_ids);
    const remaining = data.remaining_this_month ?? 0;
    return {
      remaining,
      quota: data.quota,
      lockStateFor: (video) => {
        if (video.is_demo) return "unlocked";
        const id = video.id || video.video_id;
        if (id && ids.has(id)) return "unlocked";
        return remaining > 0 ? "locked" : "exhausted";
      },
    };
  }, [isPro, isAuthenticated, data]);
}
