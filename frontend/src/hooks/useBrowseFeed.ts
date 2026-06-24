"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import type { Video } from "@/types";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "ted", label: "TED Talks" },
  { id: "interview", label: "Interviews" },
  { id: "news", label: "News" },
  { id: "vlog", label: "Vlogs" },
  { id: "educational", label: "Educational" },
  { id: "movie", label: "Movie Clips" },
  { id: "tech", label: "Tech" },
  { id: "speech", label: "Speeches" },
];

const DIFFICULTY_TABS = [
  { id: "all", label: "全部" },
  { id: "A1", label: "A1" },
  { id: "A2", label: "A2" },
  { id: "B1", label: "B1" },
  { id: "B2", label: "B2" },
  { id: "C1", label: "C1" },
  { id: "C2", label: "C2" },
];

interface BrowseFeedResponse {
  items: Video[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

export function useBrowseFeed({
  initialCategory = "all",
  initialLevel,
}: {
  initialCategory?: string;
  initialLevel?: string;
} = {}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories] = useState(CATEGORIES);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [activeLevel, setActiveLevel] = useState(initialLevel || "all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const fetchVideos = useCallback(
    async (pageNum: number, append = false) => {
      const fetchId = ++fetchIdRef.current;
      if (!append) setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          category: activeCategory,
          page: String(pageNum),
          page_size: "20",
        });
        if (activeLevel && activeLevel !== "all") {
          params.set("level", activeLevel);
        }

        const data = await api<BrowseFeedResponse>(`/api/v1/browse/feed?${params}`);
        if (fetchId !== fetchIdRef.current) return; // stale

        const newVideos = data.items || [];
        setVideos((prev) => (append ? [...prev, ...newVideos] : newVideos));
        setHasMore(data.has_more);
        setPage(pageNum);
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return;
        const message = err instanceof Error ? err.message : "加载失败";
        setError(message);
      } finally {
        if (fetchId === fetchIdRef.current) setLoading(false);
      }
    },
    [activeCategory, activeLevel]
  );

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchVideos(1, false);
  }, [fetchVideos]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchVideos(page + 1, true);
    }
  }, [loading, hasMore, page, fetchVideos]);

  const retry = useCallback(() => {
    fetchVideos(1, false);
  }, [fetchVideos]);

  return {
    videos,
    categories,
    difficultyTabs: DIFFICULTY_TABS,
    activeCategory,
    setActiveCategory,
    activeLevel,
    setActiveLevel,
    loading,
    hasMore,
    error,
    loadMore,
    retry,
  };
}
