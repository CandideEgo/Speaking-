'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, getToken } from '@/lib/api';
import type { User, Video } from '@/types';
import AIStatsPanel from '@/components/video/AIStatsPanel';
import VideoSubmitForm from '@/components/video/VideoSubmitForm';
import YouTubeSearch from '@/components/video/YouTubeSearch';
import VideoLibrary from '@/components/video/VideoLibrary';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    api<User>('/api/v1/users/me')
      .then((u) => {
        setUser(u);
      })
      .catch(() => router.push('/login'));
    api<Video[]>('/api/v1/videos').then(setVideos).catch(() => toast.error('加载视频失败'));
  }, [router]);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral" />
      </main>
    );
  }

  function handleVideoAdded(video: Video) {
    setVideos((prev) => [video, ...prev]);
  }

  return (
    <main>
      <AIStatsPanel user={user} />
      <VideoSubmitForm onVideoAdded={handleVideoAdded} />
      <YouTubeSearch onVideoAdded={handleVideoAdded} />
      <VideoLibrary videos={videos} />
    </main>
  );
}
