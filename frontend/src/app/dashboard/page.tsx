'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, getToken } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User, Video } from '@/types';
import {
  Youtube,
  Send,
  Sparkles,
  Play,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BarChart3,
  Mic,
  BookOpen,
} from 'lucide-react';

interface AIStats {
  summary: string;
  stats: {
    total_speaking_attempts: number;
    average_accuracy: number;
    vocabulary_count: number;
    videos_watched: number;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [aiStats, setAiStats] = useState<AIStats['stats'] | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const isPro = user?.plan === 'pro';

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const order = await api<{ payment_url: string }>('/api/v1/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ plan: 'pro_monthly' }),
      });
      await api(order.payment_url);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '支付失败');
    } finally {
      setUpgrading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    api<User>('/api/v1/users/me')
      .then((u) => {
        setUser(u);
        if (u.plan === 'pro') loadAIData();
      })
      .catch(() => router.push('/login'));
    api<Video[]>('/api/v1/videos').then(setVideos).catch(() => {});
  }, [router]);

  const loadAIData = useCallback(async () => {
    setLoadingAI(true);
    try {
      const [summaryRes, recRes] = await Promise.allSettled([
        api<AIStats>('/api/v1/ai/assistant/summary'),
        api<{ recommendation: string }>('/api/v1/ai/assistant/recommend'),
      ]);
      if (summaryRes.status === 'fulfilled') {
        setAiSummary(summaryRes.value.summary);
        setAiStats(summaryRes.value.stats);
      }
      if (recRes.status === 'fulfilled') setRecommendation(recRes.value.recommendation);
    } catch {}
    setLoadingAI(false);
  }, []);

  async function handleSubmitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    setSubmitting(true);
    try {
      const video = await api<Video>('/api/v1/videos', {
        method: 'POST',
        body: JSON.stringify({ source_url: videoUrl }),
      });
      setVideos((prev) => [video, ...prev]);
      setVideoUrl('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  const statusIcon = (status: string) => {
    if (status === 'ready') return <CheckCircle2 size={14} className="text-green-500" />;
    if (status === 'ready_subtitles') return <CheckCircle2 size={14} className="text-blue-500" />;
    if (status === 'error') return <AlertCircle size={14} className="text-red-500" />;
    return <Loader2 size={14} className="animate-spin text-yellow-500" />;
  };

  const statusLabel = (status: string) => {
    if (status === 'ready') return '就绪';
    if (status === 'ready_subtitles') return '可观看';
    if (status === 'error') return '失败';
    return '处理中';
  };

  const statusClass = (status: string) => {
    if (status === 'ready') return 'bg-green-50 text-green-700';
    if (status === 'ready_subtitles') return 'bg-blue-50 text-blue-700';
    if (status === 'error') return 'bg-red-50 text-red-700';
    return 'bg-yellow-50 text-yellow-700';
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 size={24} className="animate-spin text-brand-600" />
      </main>
    );
  }

  return (
    <main className="container-page py-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            你好{user.name ? `，${user.name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isPro ? 'Pro 会员，全部功能已解锁。' : '试用中。升级 Pro 解锁 AI 助手。'}
          </p>
        </div>
        {!isPro && (
          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 shadow-sm"
          >
            <Sparkles size={14} />
            {upgrading ? '处理中...' : '升级 Pro'}
          </button>
        )}
      </div>

      {isPro && aiStats && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: '跟读次数', value: aiStats.total_speaking_attempts, icon: Mic },
            { label: '准确率', value: aiStats.average_accuracy + '%', icon: BarChart3 },
            { label: '词汇量', value: aiStats.vocabulary_count, icon: BookOpen },
            { label: '视频数', value: aiStats.videos_watched, icon: Play },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <s.icon size={14} /> {s.label}
              </div>
              <p className="mt-1 text-2xl font-bold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {isPro && (
        <div className="mt-6 rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-5">
          {loadingAI ? (
            <p className="text-sm text-slate-400">AI 思考中...</p>
          ) : (
            <div className="space-y-3">
              {aiSummary && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-600">学习总结</h3>
                  <p className="mt-1 text-sm text-slate-700">{aiSummary}</p>
                </div>
              )}
              {recommendation && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-600">今日推荐</h3>
                  <p className="mt-1 text-sm text-slate-700">{recommendation}</p>
                </div>
              )}
              {!aiSummary && !recommendation && (
                <p className="text-sm text-slate-400">开始学习后，AI 会在这里总结你的学习进度。</p>
              )}
            </div>
          )}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">粘贴链接开始学习</h2>
        <form onSubmit={handleSubmitLink} className="mt-3 flex gap-3">
          <div className="relative flex-1">
            <Youtube size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="粘贴 YouTube 视频链接..."
              className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap shadow-sm"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? '处理中...' : '开始学习'}
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">我的视频库</h2>
        {videos.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 py-16">
            <Play size={32} className="text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">还没有视频</p>
            <p className="mt-1 text-xs text-slate-400">粘贴一个链接，开启第一课。</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <button
                key={v.id}
                onClick={() => (v.status === 'ready' || v.status === 'ready_subtitles') && router.push(`/watch/${v.id}`)}
                disabled={v.status !== 'ready' && v.status !== 'ready_subtitles'}
                className="group rounded-xl border border-slate-200 bg-white p-0 text-left overflow-hidden hover:border-brand-300 hover:shadow-md transition-all disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:shadow-none"
              >
                <div className="relative aspect-video bg-slate-100 flex items-center justify-center">
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Play size={32} className="text-slate-300 group-hover:text-brand-400 transition-colors" />
                  )}
                  {v.duration && (v.status === 'ready' || v.status === 'ready_subtitles') && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                      {Math.floor(v.duration / 60)}:{String(Math.floor(v.duration % 60)).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-slate-900 line-clamp-2">
                    {v.title === 'Processing...' ? '处理中...' : v.title}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', statusClass(v.status))}>
                      {statusIcon(v.status)} {statusLabel(v.status)}
                    </span>
                    {v.difficulty_level && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-500">{v.difficulty_level}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}


