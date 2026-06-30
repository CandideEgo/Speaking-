"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { User } from "@/types";

interface SettingsTabProps {
  user: User;
}

export default function SettingsTab({ user }: SettingsTabProps) {
  return (
    <div className="max-w-2xl space-y-8">
      {/* Change Password */}
      <PasswordChangeForm />

      {/* Timezone */}
      <TimezoneSection user={user} />

      {/* Notification Settings */}
      <NotificationPreferences />
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
      toast.error(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-semibold text-ink uppercase tracking-wider">
        修改密码
      </h3>
      <div>
        <label className="block text-sm font-medium text-ink mb-1">
          当前密码
        </label>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="w-full max-w-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink mb-1">
          新密码
        </label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className="w-full max-w-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink mb-1">
          确认新密码
        </label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          className="w-full max-w-md"
        />
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? "修改中..." : "修改密码"}
      </Button>
    </form>
  );
}

function TimezoneSection({ user }: { user: User }) {
  const [timezone, setTimezone] = useState(user.timezone || "Asia/Shanghai");
  const [saving, setSaving] = useState(false);

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

  async function handleSave() {
    setSaving(true);
    try {
      await api("/api/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify({ timezone }),
      });
      toast.success("时区已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink uppercase tracking-wider">
        时区
      </h3>
      <select
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        className="input-field w-64"
      >
        {COMMON_TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        影响每日活动统计的时间划分
      </p>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "保存中..." : "保存时区"}
      </Button>
    </div>
  );
}
