'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Category, VideoItem } from '@/types/platform';

interface UsePlatformFeedOptions {
  platform: 'bilibili' | 'douyin' | 'browse';
  initialCategory?: string;
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
  bilibili: [
    { id: 'all', label: '首页' },
    { id: 'spoken', label: '口语练习' },
    { id: 'interview', label: '面试英语' },
    { id: 'travel', label: '旅行英语' },
    { id: 'business', label: '商务英语' },
    { id: 'culture', label: '文化差异' },
    { id: 'daily', label: '日常对话' },
  ],
  browse: [
    { id: 'all', label: '全部' },
    { id: 'ted', label: 'TED 演讲' },
    { id: 'interview', label: '名人访谈' },
    { id: 'news', label: '新闻' },
    { id: 'vlog', label: '生活 Vlog' },
    { id: 'educational', label: '教育学习' },
    { id: 'movie', label: '电影片段' },
    { id: 'tech', label: '科技' },
  ],
  douyin: [
    { id: 'all', label: '全部' },
    { id: 'spoken', label: '口语表达' },
    { id: 'slang', label: '地道俚语' },
    { id: 'pronunciation', label: '发音技巧' },
    { id: 'vocabulary', label: '词汇积累' },
    { id: 'culture', label: '英美文化' },
    { id: 'daily', label: '日常英语' },
  ],
};

export function usePlatformFeed({ platform, initialCategory = 'all' }: UsePlatformFeedOptions) {
  const router = useRouter();
  const loaderRef = useRef<HTMLDivElement>(null);
  const fetchIdRef = useRef(0); // guard against stale fetches

  const [categories, setCategories] = useState<Category[]>(FALLBACK_CATEGORIES[platform] || []);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Stable ref for activeCategory to avoid re-creating fetchFeed
  const activeCategoryRef = useRef(activeCategory);
  activeCategoryRef.current = activeCategory;

  // Fetch categories on mount — only once
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api<CategoryResponse>(`/api/v1/${platform}/categories`);
        if (!cancelled && data.categories?.length) {
          setCategories(data.categories);
        }
        setError(null);
      } catch {
        // Use fallback categories — don't show error for categories
        // The feed fetch will show error if backend is unreachable
      }
    }
    load();
    return () => { cancelled = true; };
  }, [platform]);

  // Fetch feed — stable reference, reads activeCategory from ref
  const fetchFeed = useCallback(async (cat: string, pg: number) => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category: cat, page: String(pg) });
      const data = await api<FeedResponse>(`/api/v1/${platform}/feed?${params.toString()}`);
      // Only apply if this is still the latest fetch
      if (fetchId !== fetchIdRef.current) return;
      if (pg === 1) {
        setVideos(data.items);
      } else {
        setVideos((prev) => [...prev, ...data.items]);
      }
      setHasMore(data.has_more);
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
      toast.error(message);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [platform]);

  // Reset and fetch when category changes
  useEffect(() => {
    setPage(1);
    setVideos([]);
    setHasMore(true);
    setError(null);
    fetchFeed(activeCategory, 1);
  }, [activeCategory, fetchFeed]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchFeed(activeCategoryRef.current, nextPage);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, page, fetchFeed]);

  // Start learning: add video then navigate
  const startLearning = useCallback(async (item: VideoItem) => {
    setAddingId(item.video_id);
    try {
      const video = await api<{ id: string }>('/api/v1/videos', {
        method: 'POST',
        body: JSON.stringify({ source_url: item.url }),
      });
      router.push(`/watch/${video.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
      setAddingId(null);
    }
  }, [router]);

  // Retry feed fetch
  const retry = useCallback(() => {
    fetchFeed(activeCategory, 1);
  }, [activeCategory, fetchFeed]);

  return {
    categories,
    activeCategory,
    setActiveCategory,
    videos,
    loading,
    hasMore,
    error,
    retry,
    loaderRef,
    addingId,
    startLearning,
  };
}
