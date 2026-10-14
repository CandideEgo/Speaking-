"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { UserPreferences } from "@/types";

/**
 * 轻量读取 / 更新当前用户的学习偏好（GET|PUT /api/v1/users/me/preferences）。
 *
 * P1-5：词汇训练页需要「答对自动前进」这一个开关的持久化值，设置页也需要
 * 同一列。这里只在组件本地缓存，不引入新的全局状态主人 —— 服务端仍是唯一
 * 真相源，切换目标考试的即时刷新另走 `watchStore`（见 useTargetExam）。
 */
export function useUserPreferences(enabled = true) {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<UserPreferences>("/api/v1/users/me/preferences")
      .then((p) => {
        if (!cancelled) setPreferences(p);
      })
      .catch(() => {
        /* 读取失败按默认偏好处理，不阻塞训练 */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  /** 局部更新并把服务端返回的完整偏好写回本地缓存。 */
  const update = useCallback(async (patch: Partial<UserPreferences>) => {
    const updated = await api<UserPreferences>("/api/v1/users/me/preferences", {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    setPreferences(updated);
    return updated;
  }, []);

  return { preferences, loading, update };
}
