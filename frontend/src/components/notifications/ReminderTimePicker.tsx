"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface ReminderTimePickerProps {
  initialTime: string;
  onSaved?: (newTime: string) => void;
}

/**
 * D6 reminder time picker. Persists vocabulary_reminder_time to
 * /api/v1/users/me/preferences inside the notification_preferences JSON
 * blob (matching the B0 DEFAULT_NOTIFICATION_PREFS contract).
 */
export function ReminderTimePicker({ initialTime, onSaved }: ReminderTimePickerProps) {
  const [time, setTime] = useState(initialTime);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      toast.error("时间格式不对，请使用 HH:MM");
      return;
    }
    setSaving(true);
    try {
      // We need to merge with the existing notification_preferences. Fetch
      // the current payload, mutate, and PUT back.
      const prefs = await api<{ notification_preferences?: Record<string, unknown> }>(
        "/api/v1/users/me/preferences"
      );
      const merged = { ...(prefs.notification_preferences ?? {}), vocabulary_reminder_time: time };
      await api("/api/v1/users/me/preferences", {
        method: "PUT",
        body: JSON.stringify({ notification_preferences: merged }),
      });
      toast.success("已保存复习提醒时间");
      onSaved?.(time);
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Clock size={13} className="text-muted" />
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="text-xs text-ink bg-surface-card border border-hairline rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
      <button
        onClick={handleSave}
        disabled={saving || time === initialTime}
        className="text-[11px] text-brand-500 hover:text-brand-600 disabled:opacity-50"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
