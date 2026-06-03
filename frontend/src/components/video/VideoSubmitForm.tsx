'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Youtube, Send, Loader2 } from 'lucide-react';
import type { Video } from '@/types';

interface VideoSubmitFormProps {
  onVideoAdded: (video: Video) => void;
}

export default function VideoSubmitForm({ onVideoAdded }: VideoSubmitFormProps) {
  const [videoUrl, setVideoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    setSubmitting(true);
    try {
      const video = await api<Video>('/api/v1/videos', {
        method: 'POST',
        body: JSON.stringify({ source_url: videoUrl }),
      });
      onVideoAdded(video);
      setVideoUrl('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="container-page pb-8">
      <h2 className="font-display text-2xl font-normal text-ink tracking-display-md">添加视频</h2>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <div className="relative flex-1">
          <Youtube size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="粘贴 YouTube 视频链接..."
            className="input-field pl-11"
            required
          />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary whitespace-nowrap">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {submitting ? '处理中...' : '开始学习'}
        </button>
      </form>
    </section>
  );
}
