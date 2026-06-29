"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { UserPreferences } from "@/types";

interface LearningPrefsTabProps {
  preferences: UserPreferences | null;
  onUpdate: (prefs: UserPreferences) => void;
}

export default function LearningPrefsTab({
  preferences,
  onUpdate,
}: LearningPrefsTabProps) {
  const [goalType, setGoalType] = useState<UserPreferences["daily_goal_type"]>(
    preferences?.daily_goal_type || "speaking_attempts",
  );
  const [goalValue, setGoalValue] = useState(
    preferences?.daily_goal_value || 5,
  );
  const [subtitleMode, setSubtitleMode] = useState(
    preferences?.subtitle_mode_default || "bilingual",
  );
  const [preferredDifficulty, setPreferredDifficulty] = useState(
    preferences?.preferred_difficulty || "",
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api<UserPreferences>(
        "/api/v1/users/me/preferences",
        {
          method: "PUT",
          body: JSON.stringify({
            daily_goal_type: goalType,
            daily_goal_value: goalValue,
            subtitle_mode_default: subtitleMode,
            preferred_difficulty: preferredDifficulty || null,
          }),
        },
      );
      onUpdate(updated);
      toast.success("偏好已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  const goalTypeLabels: Record<string, string> = {
    speaking_attempts: "跟读练习次数",
    minutes: "学习分钟数",
    words: "复习单词数",
  };

  return (
    <div className="max-w-2xl space-y-8">
      {/* Daily Goal */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-ink uppercase tracking-wider">
          每日目标
        </h3>
        <p className="text-sm text-muted-foreground">
          设置每日学习目标。只有达标的日子才会计入连续学习天数 (streak)。
        </p>

        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              目标类型
            </label>
            <select
              value={goalType}
              onChange={(e) => {
                setGoalType(
                  e.target.value as UserPreferences["daily_goal_type"],
                );
                // Reset value to sensible defaults per type
                if (e.target.value === "speaking_attempts") setGoalValue(5);
                else if (e.target.value === "minutes") setGoalValue(15);
                else if (e.target.value === "words") setGoalValue(10);
              }}
              className="input-field w-48"
            >
              {Object.entries(goalTypeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              目标数值
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={goalValue}
              onChange={(e) => setGoalValue(parseInt(e.target.value) || 1)}
              className="input-field w-24"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          当前目标：每天 {goalValue} {goalTypeLabels[goalType]}
        </p>
      </div>

      {/* Default Subtitle Mode */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink uppercase tracking-wider">
          默认字幕模式
        </h3>
        <select
          value={subtitleMode}
          onChange={(e) =>
            setSubtitleMode(
              e.target.value as "bilingual" | "english" | "chinese",
            )
          }
          className="input-field w-48"
        >
          <option value="bilingual">双语字幕</option>
          <option value="english">仅英文</option>
          <option value="chinese">仅中文</option>
        </select>
      </div>

      {/* Preferred Difficulty */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink uppercase tracking-wider">
          偏好难度
        </h3>
        <select
          value={preferredDifficulty}
          onChange={(e) => setPreferredDifficulty(e.target.value)}
          className="input-field w-40"
        >
          <option value="">不限</option>
          {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">用于推荐合适难度的视频</p>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? "保存中..." : "保存偏好"}
      </button>
    </div>
  );
}
