"use client";

import { create } from "zustand";

import { api } from "@/lib/api";

interface NotificationState {
  unreadCount: number;
  setUnread: (count: number) => void;
  fetchUnread: () => Promise<void>;
  reset: () => void;
}

/**
 * One unread counter for every chrome surface (top bar, sidebar, mobile tab
 * bar). Previously TopBar polled on its own; adding the sidebar dot and the
 * due chip would have produced three independent pollers.
 */
export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  setUnread: (count) => set({ unreadCount: Math.max(0, count) }),
  fetchUnread: async () => {
    try {
      const data = await api<{ count: number }>("/api/v1/notifications/unread-count");
      set({ unreadCount: Math.max(0, data.count) });
    } catch {
      // Fail open: chrome badges are decorative; a failed poll keeps the
      // previous value instead of flashing "0".
    }
  },
  reset: () => set({ unreadCount: 0 }),
}));
