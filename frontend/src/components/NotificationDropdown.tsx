'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return `${months}个月前`;
}

export function NotificationDropdown({ onClose, onUnreadCountChange }: NotificationDropdownProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchNotifications() {
      try {
        const data = await api<Notification[]>('/api/v1/notifications?limit=20');
        if (!cancelled) {
          setNotifications(data);
        }
      } catch {
        // Silently fail — notifications are non-critical
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchNotifications();
    return () => { cancelled = true; };
  }, []);

  // Click-away and Escape to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const markAsRead = useCallback(async (notification: Notification) => {
    if (notification.is_read) return;
    try {
      await api(`/api/v1/notifications/${notification.id}/read`, { method: 'PATCH' });
      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
      );
      // Update unread count in parent
      const countData = await api<{ count: number }>('/api/v1/notifications/unread-count');
      onUnreadCountChange(countData.count);
    } catch {
      // Silently fail
    }
  }, [onUnreadCountChange]);

  const markAllAsRead = useCallback(async () => {
    setIsMarkingAll(true);
    try {
      await api('/api/v1/notifications/read-all', { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      onUnreadCountChange(0);
    } catch {
      // Silently fail
    } finally {
      setIsMarkingAll(false);
    }
  }, [onUnreadCountChange]);

  const handleNotificationClick = useCallback(async (notification: Notification) => {
    await markAsRead(notification);
    onClose();
    if (notification.related_url) {
      router.push(notification.related_url);
    }
  }, [markAsRead, onClose, router]);

  const hasUnread = notifications.some(n => !n.is_read);

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-lg border border-hairline bg-canvas shadow-lg z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
        <h3 className="text-sm font-semibold text-ink">通知</h3>
        {hasUnread && (
          <button
            onClick={markAllAsRead}
            disabled={isMarkingAll}
            className="text-xs text-coral hover:text-coral/80 transition-colors disabled:opacity-50"
          >
            {isMarkingAll ? '标记中...' : '全部已读'}
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
            <svg className="h-8 w-8 mb-2 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="text-sm">暂无通知</span>
          </div>
        ) : (
          <ul>
            {notifications.map(notification => (
              <li key={notification.id}>
                <button
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left px-4 py-3 hover:bg-cream-soft transition-colors ${
                    !notification.is_read ? 'bg-coral/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* Unread dot */}
                    {!notification.is_read && (
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-coral" />
                    )}
                    <div className={`flex-1 min-w-0 ${notification.is_read ? 'pl-4' : ''}`}>
                      <p className={`text-sm ${notification.is_read ? 'text-muted-foreground' : 'text-ink font-medium'}`}>
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
