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
    label: "System",
    description: "Important updates and maintenance notices",
    icon: Bell,
  },
  {
    id: "video_ready",
    label: "Video Ready",
    description: "When your submitted video finishes processing",
    icon: Bell,
  },
  {
    id: "pro_expiring",
    label: "Pro Expiring",
    description: "Reminder before your Pro subscription expires",
    icon: Bell,
  },
  {
    id: "vocabulary_reminder",
    label: "Vocabulary Reminder",
    description: "Daily reminder to review your vocabulary",
    icon: Bell,
  },
  {
    id: "streak_warning",
    label: "Streak Warning",
    description: "Alert when your learning streak is about to break",
    icon: Bell,
  },
  {
    id: "comment_replies",
    label: "Comment Replies",
    description: "When someone replies to your comment",
    icon: Bell,
  },
  {
    id: "new_followers",
    label: "New Followers",
    description: "When someone starts following you",
    icon: Bell,
  },
  {
    id: "post_likes",
    label: "Post Likes",
    description: "When someone likes your post",
    icon: Bell,
  },
  {
    id: "achievements",
    label: "Achievements",
    description: "Milestones and badges you have earned",
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
      toast.success("Notification preferences saved");
    } catch (err) {
      toastApiError(err, "Failed to save preferences");
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
        <h2 className="font-display text-2xl text-ink">
          Notification Preferences
        </h2>
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
          Save
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Choose which notifications you want to receive. You can update these at
        any time.
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
