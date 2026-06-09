'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Video } from '@/types';

interface UseHomeFeedOptions {
  initialDifficulty?: string;
}

const DIFFICULTY_TABS = [
  { id: 'all', label: '全部' },
  { id: 'A1', label: 'A1' },
  { id: 'A2', label: 'A2' },
  { id: 'B1', label: 'B1' },
  { id: 'B2', label: 'B2' },
  { id: 'C1', label: 'C1' },
  { id: 'C2', label: 'C2' },
];

export function useHomeFeed({ initialDifficulty = 'all' }: UseHomeFeedOptions = {}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDifficulty, setActiveDifficulty] = useState(initialDifficulty);
  const cancelledRef = useRef(false);

  // Shared fetch logic — used by both useEffect and retry
  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Video[]>('/api/v1/videos/public');
      if (!cancelledRef.current) {
        setVideos(data);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        const message = err instanceof Error ? err.message : '加载视频失败';
        setError(message);
        toast.error(message);
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch public videos on mount
  useEffect(() => {
    cancelledRef.current = false;
    fetchVideos();
    return () => { cancelledRef.current = true; };
  }, [fetchVideos]);

  // Client-side difficulty filter
  const filtered = activeDifficulty === 'all'
    ? videos
    : videos.filter((v) => v.difficulty_level === activeDifficulty);

  // Group by first topic tag
  const grouped: Record<string, Video[]> = {};
  for (const v of filtered) {
    const tag = v.topic_tags?.split(',')[0]?.trim() || '其他';
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
    difficultyTabs: DIFFICULTY_TABS,
    activeDifficulty,
    setActiveDifficulty,
  };
}
