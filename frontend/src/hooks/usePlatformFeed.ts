"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toastApiError } from "@/lib/errors";
import { api } from "@/lib/api";
import { TOPIC_CATEGORY_LABELS } from "@/lib/topicCategories";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { Category, VideoItem } from "@/types/platform";
import type { Paginated, Video } from "@/types";

type Platform = "browse" | "home";

/** Feed ordering. "recommended" is the personalized home mix and only applies
 *  to the unfiltered home view; "hot"/"latest" map to /browse/feed?sort=… and
 *  compose with category/level filters. */
export type FeedSort = "recommended" | "hot" | "latest";

interface UsePlatformFeedOptions {
  platform: Platform;
  initialCategory?: string;
  initialLevel?: string;
}

interface CategoryResponse {
  categories: Category[];
}

// Fallback categories if API fails. Home labels the "all" tab as 推荐.
// Labels come from lib/topicCategories (single source shared with VideoCard);
// ids must stay in sync with the backend taxonomy
// (services/video_classification.TOPIC_CATEGORIES).
const TOPIC_TABS = Object.entries(TOPIC_CATEGORY_LABELS).map(([id, label]) => ({ id, label }));

const FALLBACK_CATEGORIES: Record<Platform, Category[]> = {
  browse: [{ id: "all", label: "全部" }, ...TOPIC_TABS],
  home: [{ id: "all", label: "推荐" }, ...TOPIC_TABS],
};

/** Map a home-recommendation Video (from /recommendations/home) to VideoItem
 *  so the grid + VideoCard contract stays uniform across browse/home. */
function homeVideoToItem(v: Video): VideoItem {
  return {
    video_id: v.id,
    id: v.id,
    url: v.source_url,
    title: v.title,
    channel_title: v.channel_name ?? "",
    channel_slug: v.channel_slug ?? undefined,
    thumbnail_url: v.thumbnail_url ?? "",
    duration: v.duration,
    view_count: v.view_count,
    favorite_count: v.favorite_count,
    description: v.description,
    difficulty_level: v.difficulty_level,
    topic_tags: v.topic_tags,
    is_official: v.is_official,
    status: v.status,
    created_at: v.created_at,
  };
}

const PAGE_SIZE = 20;

export function usePlatformFeed({
  platform,
  initialCategory = "all",
  initialLevel = "all",
}: UsePlatformFeedOptions) {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>(FALLBACK_CATEGORIES[platform] || []);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [activeLevel, setActiveLevel] = useState(initialLevel);
  const [sort, setSort] = useState<FeedSort>(platform === "home" ? "recommended" : "latest");
  const [addingId, setAddingId] = useState<string | null>(null);

  const {
    items: videos,
    hasMore,
    total,
    loading,
    error,
    reload,
    loadMore,
    loaderRef,
  } = usePaginatedList<VideoItem>({
    fetcher: async (pg) => {
      // Home default view (推荐 + 全部级别): personalized 40/30/20/10 mix.
      // Any filter active on home: fall back to browse/feed (supports category+level+sort).
      // Browse: always /browse/feed.
      const isHomeDefault =
        platform === "home" &&
        sort === "recommended" &&
        activeCategory === "all" &&
        activeLevel === "all";

      if (isHomeDefault) {
        const data = await api<Paginated<Video>>(
          `/api/v1/recommendations/home?page=${pg}&page_size=${PAGE_SIZE}`
        );
        return {
          items: (data.items ?? []).map(homeVideoToItem),
          page: data.page ?? pg,
          page_size: data.page_size ?? PAGE_SIZE,
          has_more: data.has_more,
          total: data.total,
        };
      }

      const params = new URLSearchParams({
        category: activeCategory,
        page: String(pg),
        page_size: String(PAGE_SIZE),
      });
      if (activeLevel && activeLevel !== "all") params.set("level", activeLevel);
      // "latest" is the backend default — omit it so browse URLs/cache keys stay unchanged.
      if (sort === "hot") params.set("sort", "hot");
      return api<Paginated<VideoItem>>(`/api/v1/browse/feed?${params.toString()}`);
    },
    mode: "append",
    filters: [activeCategory, activeLevel, platform, sort],
  });

  // Fetch categories on mount - only once. Home reuses the browse categories
  // endpoint (no /home/categories), overriding the "all" label to 推荐.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api<CategoryResponse>(`/api/v1/browse/categories`);
        if (!cancelled && data.categories?.length) {
          if (platform === "home") {
            setCategories(
              data.categories.map((c) => (c.id === "all" ? { ...c, label: "推荐" } : c))
            );
          } else {
            setCategories(data.categories);
          }
        }
      } catch {
        // Use fallback categories - don't show error for categories
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
      // Browse videos already have a database ID - navigate directly
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
    [router]
  );

  return {
    categories,
    activeCategory,
    setActiveCategory,
    activeLevel,
    setActiveLevel,
    sort,
    setSort,
    videos,
    loading,
    hasMore,
    total,
    error,
    retry: reload,
    loadMore,
    loaderRef,
    addingId,
    startLearning,
  };
}
