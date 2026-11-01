"use client";

/**
 * 观看页的用户偏好读写（FE-06 提取点）：目标考试级别与字幕字号。
 *
 * 两个偏好都走 `/users/me/preferences`：进页读一次、改动尽力而为地写回。
 * 读失败时目标级别退回 `cet4`（与旧实现一致），字号保持默认 `medium`；
 * 写失败不回滚本地选择——本次会话仍然生效，只提示一次。
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { SubtitleFontSize } from "@/components/watch/VideoControls";

const FONT_SIZES: readonly SubtitleFontSize[] = ["small", "medium", "large"];
const DEFAULT_EXAM_LEVEL = "cet4";

interface Options {
  /** 已登录才读偏好；未登录保持默认值。 */
  enabled: boolean;
  /** 目标级别存在 `watchStore`，由页面传入 setter。 */
  setSelectedExamLevel: (level: string) => void;
}

interface WatchPreferences {
  subtitleFontSize: SubtitleFontSize;
  /** 切换目标级别：立即生效 + 尽力写回；失败提示但保留本次选择。 */
  handleExamLevelChange: (level: string) => Promise<void>;
  /** 切换字幕字号：立即生效 + 尽力写回。 */
  handleFontSizeChange: (size: SubtitleFontSize) => Promise<void>;
}

export function useWatchPreferences({ enabled, setSelectedExamLevel }: Options): WatchPreferences {
  const [subtitleFontSize, setSubtitleFontSize] = useState<SubtitleFontSize>("medium");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const prefs = await api<{
          target_exam: string | null;
          subtitle_font_size?: string | null;
        }>("/api/v1/users/me/preferences");
        if (cancelled) return;
        setSelectedExamLevel(prefs.target_exam ?? DEFAULT_EXAM_LEVEL);
        const size = prefs.subtitle_font_size;
        if (size && (FONT_SIZES as readonly string[]).includes(size)) {
          setSubtitleFontSize(size as SubtitleFontSize);
        }
      } catch {
        if (!cancelled) setSelectedExamLevel(DEFAULT_EXAM_LEVEL);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, setSelectedExamLevel]);

  const handleExamLevelChange = useCallback(
    async (level: string) => {
      setSelectedExamLevel(level);
      try {
        await api("/api/v1/users/me/preferences", {
          method: "PUT",
          body: JSON.stringify({ target_exam: level }),
        });
      } catch {
        // non-fatal: selection still applies for this session
        toast.error("偏好保存失败，本次会话仍生效");
      }
    },
    [setSelectedExamLevel]
  );

  const handleFontSizeChange = useCallback(async (size: SubtitleFontSize) => {
    setSubtitleFontSize(size);
    try {
      await api("/api/v1/users/me/preferences", {
        method: "PUT",
        body: JSON.stringify({ subtitle_font_size: size }),
      });
    } catch {
      // non-fatal: 本次会话仍生效
    }
  }, []);

  return { subtitleFontSize, handleExamLevelChange, handleFontSizeChange };
}
