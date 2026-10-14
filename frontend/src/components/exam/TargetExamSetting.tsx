"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { TARGET_LEVEL_OPTIONS, levelDotClass, levelMeta } from "@/lib/examLevels";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useWatchStore } from "@/stores/watchStore";
import { cn } from "@/lib/utils";
import type { UserPreferences } from "@/types";

interface TargetExamSettingProps {
  /** 已加载的当前值；不传则由组件自己拉取偏好。 */
  value?: string | null;
  /** 保存成功后回调完整偏好（设置页用来同步页级 state）。 */
  onSaved?: (prefs: UserPreferences) => void;
  /** 紧凑档：一行 chip，用于首页等非设置场景。 */
  compact?: boolean;
  className?: string;
}

/**
 * 「设置目标考试」固定入口（P1-1）。
 *
 * 考试定位是「视频词汇 + 阅读训练」，目标考试决定播放页考试词高亮的下限。
 * 保存后同时写入 `watchStore.selectedExamLevel`：那是播放页高亮读的全局槽位，
 * 这样从首页/设置改目标后，已经挂载的播放页也能立刻刷新高亮（不必等重挂载）。
 */
export function TargetExamSetting({ value, onSaved, compact, className }: TargetExamSettingProps) {
  const { preferences, update } = useUserPreferences(value === undefined);
  const setSelectedExamLevel = useWatchStore((s) => s.setSelectedExamLevel);
  const current = value !== undefined ? value : (preferences?.target_exam ?? null);
  const [saving, setSaving] = useState<string | null>(null);

  async function handleSelect(key: string) {
    if (saving || key === current) return;
    setSaving(key);
    try {
      const updated = await update({ target_exam: key });
      setSelectedExamLevel(key);
      onSaved?.(updated);
      if (!compact) toast.success(`目标考试已设为 ${levelMeta(key)?.label ?? key}`);
    } catch {
      toast.error("目标保存失败，请重试");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1.5 text-meta text-muted">
        <Target size={13} className="text-brand-500" />
        <span>设置目标考试</span>
        {!current && <span className="text-muted-soft">· 未设置时默认按四级高亮</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TARGET_LEVEL_OPTIONS.map((opt) => {
          const active = current === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleSelect(opt.key)}
              disabled={saving !== null}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-meta font-medium transition-colors cursor-pointer disabled:opacity-60",
                active
                  ? "border-ink bg-ink text-canvas"
                  : "border-hairline bg-canvas text-muted hover:border-ink/40 hover:text-ink"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full", levelDotClass(opt.color))} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
