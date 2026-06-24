"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { User, UserStats, StreakInfo, ActivityCalendar, LearningRecord } from "@/types";

interface DashboardData {
  user: User | null;
  stats: UserStats | null;
  streak: StreakInfo | null;
  activityCalendar: ActivityCalendar | null;
  recentRecords: LearningRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDashboardData(): DashboardData {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [activityCalendar, setActivityCalendar] = useState<ActivityCalendar | null>(null);
  const [recentRecords, setRecentRecords] = useState<LearningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const [userRes, statsRes, streakRes, activityRes, recordsRes] = await Promise.allSettled([
        api<User>("/api/v1/users/me"),
        api<UserStats>("/api/v1/users/me/stats?period=week"),
        api<StreakInfo>("/api/v1/users/me/streak"),
        api<ActivityCalendar>(
          `/api/v1/users/me/activity?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
        ),
        api<{ records: LearningRecord[]; total: number }>(
          "/api/v1/learning/records?page=1&page_size=5"
        ),
      ]);

      if (userRes.status === "fulfilled") setUser(userRes.value);
      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      if (streakRes.status === "fulfilled") setStreak(streakRes.value);
      if (activityRes.status === "fulfilled") setActivityCalendar(activityRes.value);
      if (recordsRes.status === "fulfilled") setRecentRecords(recordsRes.value.records);
    } catch {
      setError("加载数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    fetchData();
  }, [fetchData, isAuthenticated, isLoading]);

  return {
    user,
    stats,
    streak,
    activityCalendar,
    recentRecords,
    loading,
    error,
    refetch: fetchData,
  };
}
