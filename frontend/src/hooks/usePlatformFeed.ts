"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toastApiError } from "@/lib/errors";
import { api } from "@/lib/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { Category, VideoItem } from "@/types/platform";

interface UsePlatformFeedOptions {
  platform: "browse";
  initialCategory?: string;
  initialLevel?: string;
}

interface FeedResponse {
  items: VideoItem[];
  has_more: boolean;
}

interface CategoryResponse {
  categories: Category[];
}

// Fallback categories if API fails
const FALLBACK_CATEGORIES: Record<string, Category[]> = {
  browse: [
    { id: "all", label: "全部" },
    { id: "ted", label: "TED 演讲" },
    { id: "interview", label: "名人访谈" },
    { id: "news", label: "新闻" },
    { id: "vlog", label: "生活 Vlog" },
    { id: "educational", label: "教育学习" },
    { id: "movie", label: "电影片段" },
    { id: "tech", label: "科技" },
  ],
};

export function usePlatformFeed({
  platform,
  initialCategory = "all",
  initialLevel = "all",
}: UsePlatformFeedOptions) {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>(
    FALLBACK_CATEGORIES[platform] || [],
  );
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [activeLevel, setActiveLevel] = useState(initialLevel);
  const [addingId, setAddingId] = useState<string | null>(null);

  const {
    items: videos,
    hasMore,
    total,
    loading,
    error,
    reload,
    loaderRef,
  } = usePaginatedList<VideoItem>({
    fetcher: async (pg) => {
      const params = new URLSearchParams({
        category: activeCategory,
        page: String(pg),
      });
      if (activeLevel && activeLevel !== "all")
        params.set("level", activeLevel);
      const data = await api<FeedResponse & { total?: number }>(
        `/api/v1/${platform}/feed?${params.toString()}`,
      );
      return { items: data.items, has_more: data.has_more, total: data.total };
    },
    mode: "append",
    filters: [activeCategory, activeLevel],
  });

  // Fetch categories on mount — only once
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api<CategoryResponse>(
          `/api/v1/${platform}/categories`,
        );
        if (!cancelled && data.categories?.length) {
          setCategories(data.categories);
        }
      } catch {
        // Use fallback categories — don't show error for categories
        // The feed fetch will show error if backend is unreachable
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  // Start learning: add video then navigate
  // For browse videos (already in DB with `id`), navigate directly
  const startLearning = useCallback(
    async (item: VideoItem) => {
      // Browse videos already have a database ID — navigate directly
      if (item.id) {
        router.push(`/watch/${item.id}`);
        return;
      }
      setAddingId(item.video_id);
      try {
        const video = await api<{ id: string }>("/api/v1/videos", {
          method: "POST",
          body: JSON.stringify({ source_url: item.url }),
        });
        router.push(`/watch/${video.id}`);
      } catch (err) {
        toastApiError(err, "添加失败");
        setAddingId(null);
      }
    },
    [router],
  );

  return {
    categories,
    activeCategory,
    setActiveCategory,
    activeLevel,
    setActiveLevel,
    videos,
    loading,
    hasMore,
    total,
    error,
    retry: reload,
    loaderRef,
    addingId,
    startLearning,
  };
}
