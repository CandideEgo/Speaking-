"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toastApiError, apiErrorMessage } from "@/lib/errors";
import { api } from "@/lib/api";
import { useFeedStore } from "@/stores/feedStore";
import type { Video } from "@/types";

interface UseHomeFeedOptions {
  initialGroup?: string;
}

/* Difficulty groups map a single pill to one or more CEFR levels. */
export const DIFFICULTY_GROUPS = [
  { id: "all", label: "全部", levels: [] as string[] },
  { id: "beginner", label: "初级 A1-A2", levels: ["A1", "A2"] },
  { id: "intermediate", label: "中级 B1-B2", levels: ["B1", "B2"] },
  { id: "advanced", label: "高级 C1-C2", levels: ["C1", "C2"] },
];

/**
 * P2 home feed (ADR-0011). Fetches the algorithmic recommendation stream
 * from /recommendations/home (40/30/20/10 mix + soft personalization) into
 * the shared feedStore, then applies client-side difficulty filtering + topic
 * grouping on top. Falls back to the store's cached feed while reloading.
 */
export function useHomeFeed({ initialGroup = "all" }: UseHomeFeedOptions = {}) {
  const feed = useFeedStore((s) => s.feed);
  const setFeed = useFeedStore((s) => s.setFeed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState(initialGroup);
  const cancelledRef = useRef(false);

  // Shared fetch logic — used by both useEffect and retry
  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ items: Video[] }>(
        "/api/v1/recommendations/home?page=1&page_size=50",
      );
      if (!cancelledRef.current) {
        setFeed(data.items);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        toastApiError(err, "加载视频失败");
        setError(apiErrorMessage(err, "加载视频失败"));
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [setFeed]);

  // Fetch recommendation feed on mount
  useEffect(() => {
    cancelledRef.current = false;
    fetchVideos();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchVideos]);

  // Client-side difficulty filter by group (set of levels)
  const group = DIFFICULTY_GROUPS.find((g) => g.id === activeGroup);
  const levels = group?.levels ?? [];
  const filtered =
    levels.length === 0
      ? feed
      : feed.filter(
          (v) =>
            v.difficulty_level != null && levels.includes(v.difficulty_level),
        );

  // Group by first topic tag
  const grouped: Record<string, Video[]> = {};
  for (const v of filtered) {
    const tag = v.topic_tags?.split(",")[0]?.trim() || "其他";
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push(v);
  }

  const retry = useCallback(() => {
    fetchVideos();
  }, [fetchVideos]);

  return {
    videos: filtered,
    grouped,
    loading,
    error,
    retry,
    activeGroup,
    setActiveGroup,
  };
}
