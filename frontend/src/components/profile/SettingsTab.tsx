"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { api } from "@/lib/api";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormField } from "@/components/ui/FormField";
import type { User, UserPreferences } from "@/types";

interface SettingsTabProps {
  user: User;
  preferences: UserPreferences | null;
  onUpdatePreferences: (prefs: UserPreferences) => void;
}

const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Australia/Sydney",
];

const GOAL_TYPE_LABELS: Record<string, string> = {
  minutes: "学习分钟数",
  words: "复习单词数",
};

/**
 * 设置（1B 设计减法后）：原「账户设置」「学习偏好」两个 Tab 合并为本页，
 * 分「学习」「账户」两个分组卡；学习目标/字幕/难度/时区共用一个底部保存，
 * 改密码因需要当前密码校验保留独立提交；通知设置默认折叠收纳。
 */
export default function SettingsTab({ user, preferences, onUpdatePreferences }: SettingsTabProps) {
  // Learning preferences
  const [goalType, setGoalType] = useState<UserPreferences["daily_goal_type"]>(
    preferences?.daily_goal_type === "minutes" ? "minutes" : "words"
  );
  const [goalValue, setGoalValue] = useState(preferences?.daily_goal_value || 5);
  const [subtitleMode, setSubtitleMode] = useState(
    preferences?.subtitle_mode_default || "bilingual"
  );
  const [preferredDifficulty, setPreferredDifficulty] = useState(
    preferences?.preferred_difficulty || ""
  );

  // Timezone — default follows the browser instead of assuming Shanghai.
  const browserTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "Asia/Shanghai";
  const [timezone, setTimezone] = useState(user.timezone || browserTz);

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api<UserPreferences>("/api/v1/users/me/preferences", {
        method: "PUT",
        body: JSON.stringify({
          daily_goal_type: goalType,
          daily_goal_value: goalValue,
          subtitle_mode_default: subtitleMode,
          preferred_difficulty: preferredDifficulty || null,
        }),
      });
      onUpdatePreferences(updated);
      if (timezone !== user.timezone) {
        await api("/api/v1/users/me", {
          method: "PATCH",
          body: JSON.stringify({ timezone }),
        });
      }
      toast.success("设置已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Learning group */}
      <section className="rounded-xl border border-hairline bg-canvas p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">学习</h2>

        <FormField label="每日目标" hint="设置每日学习目标，养成坚持学习的好习惯">
          <div className="flex items-center gap-3">
            <Select
              value={goalType}
              onChange={(e) => {
                setGoalType(e.target.value as UserPreferences["daily_goal_type"]);
                // Reset value to sensible defaults per type
                if (e.target.value === "minutes") setGoalValue(15);
                else if (e.target.value === "words") setGoalValue(10);
              }}
              className="w-40"
            >
              {Object.entries(GOAL_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={1}
              max={100}
              value={goalValue}
              onChange={(e) => setGoalValue(parseInt(e.target.value) || 1)}
              className="w-24"
            />
            <span className="text-xs text-muted">
              每天 {goalValue} {GOAL_TYPE_LABELS[goalType]}
            </span>
          </div>
        </FormField>

        <FormField label="默认字幕模式">
          <Select
            value={subtitleMode}
            onChange={(e) => setSubtitleMode(e.target.value as "bilingual" | "english" | "chinese")}
            className="w-40"
          >
            <option value="bilingual">双语字幕</option>
            <option value="english">仅英文</option>
            <option value="chinese">仅中文</option>
          </Select>
        </FormField>

        <FormField label="偏好难度" hint="用于推荐合适难度的视频">
          <Select
            value={preferredDifficulty}
            onChange={(e) => setPreferredDifficulty(e.target.value)}
            className="w-40"
          >
            <option value="">不限</option>
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="时区" hint="影响每日活动统计的时间划分，默认跟随浏览器">
          <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-56">
            {[...new Set([timezone, ...COMMON_TIMEZONES])].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </FormField>
      </section>

      {/* Account group */}
      <section className="rounded-xl border border-hairline bg-canvas p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">账户</h2>
        <PasswordChangeForm />
        <NotificationPreferences />
      </section>

      {/* Unified save for learning prefs + timezone */}
      <div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存设置"}
        </Button>
      </div>
    </div>
  );
}

function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("新密码至少 8 个字符");
      return;
    }
    setSaving(true);
    try {
      await api("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      toast.success("密码已修改");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toastApiError(err, "修改失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="当前密码">
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full"
          />
        </FormField>
        <FormField label="新密码">
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full"
          />
        </FormField>
        <FormField label="确认新密码">
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="w-full"
          />
        </FormField>
      </div>
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={saving}>
          {saving ? "修改中..." : "修改密码"}
        </Button>
      </div>
    </form>
  );
}
