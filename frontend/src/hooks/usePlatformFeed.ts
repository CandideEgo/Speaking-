"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

const SORT_VALUES: readonly string[] = ["recommended", "hot", "latest"];

function isFeedSort(value: string | null): value is FeedSort {
  return value !== null && SORT_VALUES.includes(value);
}

/** 各平台默认排序：首页个性化推荐，频道页最新（也是后端默认）。 */
const DEFAULT_SORT: Record<Platform, FeedSort> = { home: "recommended", browse: "latest" };

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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<Category[]>(FALLBACK_CATEGORIES[platform] || []);
  const [addingId, setAddingId] = useState<string | null>(null);

  // 筛选的唯一真相是 URL（读取即派生，不做 state↔URL 双向同步 —— 那会竞态）：
  // 返回时 URL 上带着来时的筛选，列表、滚动位置、返回按钮三者才对得上。
  const defaultSort = DEFAULT_SORT[platform];
  const sortParam = searchParams.get("sort");
  const activeCategory = searchParams.get("category") ?? initialCategory;
  const activeLevel = searchParams.get("level") ?? initialLevel;
  const sort: FeedSort = isFeedSort(sortParam) ? sortParam : defaultSort;

  const query = searchParams.toString();
  // 已请求写入的 query。首页「清除筛选」会连续调用三个 setter，而 replace 落地的
  // searchParams 要等下一次 render 才更新 —— 没有这个 ref，三次调用会各自基于同一个
  // 旧 URL 计算，互相覆盖成「只清掉最后一个」。
  const pendingQueryRef = useRef(query);
  useEffect(() => {
    pendingQueryRef.current = query;
  }, [query]);

  /** 写回 URL；非默认值的才写，未筛选时 URL 保持干净。 */
  const updateFilters = useCallback(
    (patch: { category?: string; level?: string; sort?: FeedSort }) => {
      const next = new URLSearchParams(pendingQueryRef.current);
      const apply = (key: string, value: string | undefined, fallback: string) => {
        if (value === undefined) return;
        if (value === fallback) next.delete(key);
        else next.set(key, value);
      };
      apply("category", patch.category, "all");
      apply("level", patch.level, "all");
      apply("sort", patch.sort, defaultSort);
      const nextQuery = next.toString();
      pendingQueryRef.current = nextQuery;
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    },
    [defaultSort, pathname, router]
  );

  const setActiveCategory = useCallback(
    (value: string) => updateFilters({ category: value }),
    [updateFilters]
  );
  const setActiveLevel = useCallback(
    (value: string) => updateFilters({ level: value }),
    [updateFilters]
  );
  const setSort = useCallback((value: FeedSort) => updateFilters({ sort: value }), [updateFilters]);

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
