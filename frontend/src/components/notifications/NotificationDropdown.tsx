"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useAuthStore } from "@/stores/authStore";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  related_url: string | null;
  created_at: string;
}

interface NotificationDropdownProps {
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
}

/**
 * Build WebSocket URL from the current page origin.
 * Detects ws:/wss: from the page protocol and uses the same host,
 * so nginx (prod) or Next.js rewrites (dev) route to the backend.
 */
function buildWsUrl(token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/api/v1/notifications/ws?token=${encodeURIComponent(token)}`;
}

export function NotificationDropdown({
  onClose,
  onUnreadCountChange,
}: NotificationDropdownProps) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasFetchedRef = useRef(false);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api<Notification[]>("/api/v1/notifications?limit=20");
      setNotifications(data);
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, []);

  // Fetch unread count and propagate to parent
  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await api<{ count: number }>(
        "/api/v1/notifications/unread-count",
      );
      onUnreadCountChange(data.count);
    } catch {
      // Silently fail
    }
  }, [onUnreadCountChange]);

  // Initial fetch on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      await fetchNotifications();
      if (!cancelled) setIsLoading(false);
    }
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      load();
    }
    return () => {
      cancelled = true;
    };
  }, [fetchNotifications]);

  // WebSocket connection for real-time notifications
  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_BASE_DELAY = 1000; // 1s, doubles each attempt

    function connect() {
      if (!token) return;

      try {
        ws = new WebSocket(buildWsUrl(token));
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          reconnectAttempts = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Handle incoming notification
            if (data.type === "notification" && data.notification) {
              const notification: Notification = data.notification;
              setNotifications((prev) => [notification, ...prev].slice(0, 50));
              // Update unread count
              fetchUnreadCount();
            } else if (data.type === "unread_count") {
              onUnreadCountChange(data.count ?? 0);
            }
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          wsRef.current = null;

          // Auto-reconnect with exponential backoff
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts);
            reconnectAttempts++;
            reconnectTimerRef.current = setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          // onclose will fire after onerror, which handles reconnect
        };
      } catch {
        // WebSocket construction failed — fallback to polling is already set up
        setWsConnected(false);
      }
    }

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (ws) {
        ws.onclose = null; // Prevent reconnect on intentional close
        ws.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [token, onUnreadCountChange, fetchUnreadCount]);

  // Fallback: polling when WebSocket is not connected
  useEffect(() => {
    // If WebSocket is connected, no need to poll
    if (wsConnected) return;

    // Poll every 30 seconds when WebSocket is down
    pollIntervalRef.current = setInterval(async () => {
      await fetchNotifications();
      await fetchUnreadCount();
    }, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [wsConnected, fetchNotifications, fetchUnreadCount]);

  // Click-away and Escape to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const markAsRead = useCallback(
    async (notification: Notification) => {
      if (notification.is_read) return;
      try {
        await api(`/api/v1/notifications/${notification.id}/read`, {
          method: "PATCH",
        });
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, is_read: true } : n,
          ),
        );
        await fetchUnreadCount();
      } catch {
        // Silently fail
      }
    },
    [fetchUnreadCount],
  );

  const markAllAsRead = useCallback(async () => {
    setIsMarkingAll(true);
    try {
      await api("/api/v1/notifications/read-all", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      onUnreadCountChange(0);
    } catch {
      // Silently fail
    } finally {
      setIsMarkingAll(false);
    }
  }, [onUnreadCountChange]);

  const handleNotificationClick = useCallback(
    async (notification: Notification) => {
      await markAsRead(notification);
      onClose();
      if (notification.related_url) {
        router.push(notification.related_url);
      }
    },
    [markAsRead, onClose, router],
  );

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-lg border border-hairline bg-canvas shadow-lg z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">通知</h3>
          {/* WebSocket connection indicator */}
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              wsConnected ? "bg-green-400" : "bg-muted-foreground/30"
            }`}
            title={wsConnected ? "实时连接" : "轮询模式"}
          />
        </div>
        {hasUnread && (
          <button
            onClick={markAllAsRead}
            disabled={isMarkingAll}
            className="text-xs text-coral hover:text-coral/80 transition-colors disabled:opacity-50"
          >
            {isMarkingAll ? "标记中..." : "全部已读"}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-coral border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Bell size={32} className="mb-2 opacity-40" />
            <span className="text-sm">暂无通知</span>
          </div>
        ) : (
          <ul>
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left px-4 py-3 hover:bg-cream-soft transition-colors ${
                    !notification.is_read ? "bg-coral/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* Unread dot */}
                    {!notification.is_read && (
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-coral" />
                    )}
                    <div
                      className={`flex-1 min-w-0 ${notification.is_read ? "pl-4" : ""}`}
                    >
                      <p
                        className={`text-sm ${notification.is_read ? "text-muted-foreground" : "text-ink font-medium"}`}
                      >
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {timeAgo(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
