"use client";

import { useEffect } from "react";

import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { useAuthStore } from "@/stores/authStore";
import { useNotificationStore } from "@/stores/notificationStore";

/** Single poller for the unread badge, mounted once in the app shell. */
export function UnreadCountSync() {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const fetchUnread = useNotificationStore((s) => s.fetchUnread);
  const reset = useNotificationStore((s) => s.reset);

  useEffect(() => {
    if (!authenticated) {
      reset();
      return;
    }
    void fetchUnread();
  }, [authenticated, fetchUnread, reset]);

  useVisibilityAwareInterval(fetchUnread, 30_000, authenticated);
  return null;
}
