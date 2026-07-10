"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { type LucideIcon, Bell, Save, Loader2 } from "lucide-react";

interface NotificationType {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const NOTIFICATION_TYPES: NotificationType[] = [
  {
    id: "system",
    label: "系统通知",
    description: "重要更新与维护公告",
    icon: Bell,
  },
  {
    id: "video_ready",
    label: "视频就绪",
    description: "你提交的视频处理完成时通知",
    icon: Bell,
  },
  {
    id: "pro_expiring",
    label: "Pro 即将到期",
    description: "Pro 会员到期前提醒",
    icon: Bell,
  },
  {
    id: "vocabulary_reminder",
    label: "词汇复习提醒",
    description: "每日提醒复习词汇",
    icon: Bell,
  },
  {
    id: "streak_warning",
    label: "连续学习提醒",
    description: "学习连续记录即将中断时提醒",
    icon: Bell,
  },
  {
    id: "comment_replies",
    label: "评论回复",
    description: "有人回复你的评论时通知",
    icon: Bell,
  },
  {
    id: "new_followers",
    label: "新增关注",
    description: "有人关注你时通知",
    icon: Bell,
  },
  {
    id: "post_likes",
    label: "帖子点赞",
    description: "有人点赞你的帖子时通知",
    icon: Bell,
  },
  {
    id: "achievements",
    label: "成就达成",
    description: "解锁的里程碑与徽章",
    icon: Bell,
  },
];

interface Preferences {
  [key: string]: boolean;
}

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    setLoading(true);
    try {
      const data = await api<Preferences>("/api/v1/notifications/preferences");
      setPreferences(data);
    } catch {
      // Initialize with all enabled by default
      const defaults: Preferences = {};
      NOTIFICATION_TYPES.forEach((t) => {
        defaults[t.id] = true;
      });
      setPreferences(defaults);
    } finally {
      setLoading(false);
    }
  }

  function togglePreference(id: string) {
    setPreferences((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api("/api/v1/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(preferences),
      });
      toast.success("通知偏好已保存");
    } catch (err) {
      toastApiError(err, "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-coral" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink">通知偏好设置</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors",
            saving
              ? "bg-coral-disabled text-muted-foreground cursor-not-allowed"
              : "bg-coral text-white hover:bg-coral-active",
          )}
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          保存
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        选择你想接收的通知，可随时更新。
      </p>

      <div className="divide-y divide-hairline rounded-lg border border-hairline bg-canvas">
        {NOTIFICATION_TYPES.map((type) => {
          const enabled = preferences[type.id] !== false;
          return (
            <div
              key={type.id}
              className="flex items-center justify-between px-5 py-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-cream-soft">
                  <type.icon className="h-4 w-4 text-coral" />
                </div>
                <div>
                  <div className="text-sm font-medium text-ink">
                    {type.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {type.description}
                  </div>
                </div>
              </div>
              <button
                onClick={() => togglePreference(type.id)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-coral/15 focus:ring-offset-2",
                  enabled ? "bg-coral" : "bg-hairline",
                )}
                role="switch"
                aria-checked={enabled}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    enabled ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
