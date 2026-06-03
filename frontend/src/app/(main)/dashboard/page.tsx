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
  Search,
  Plus,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

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
    api<Video[]>('/api/v1/videos').then(setVideos).catch(() => toast.error('加载视频失败'));
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

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const data = await api<{ items: any[]; total: number }>(
        `/api/v1/youtube/search?q=${encodeURIComponent(searchQuery)}`
      );
      setSearchResults(data.items);
      if (data.items.length === 0) toast.info('未找到相关视频');
    } catch {
      toast.error('搜索失败，请检查 API Key 配置');
    } finally {
      setSearching(false);
    }
  }

  async function addFromSearch(url: string, videoId: string) {
    setAddingId(videoId);
    try {
      const video = await api<Video>('/api/v1/videos', {
        method: 'POST',
        body: JSON.stringify({ source_url: url }),
      });
      setVideos((prev) => [video, ...prev]);
      setSearchResults((prev) => prev.filter((item) => item.video_id !== videoId));
      toast.success('已添加到学习列表');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setAddingId(null);
    }
  }

  const statusIcon = (status: string) => {
    if (status === 'ready') return <CheckCircle2 size={14} className="text-green-600" />;
    if (status === 'ready_subtitles') return <CheckCircle2 size={14} className="text-coral" />;
    if (status === 'error') return <AlertCircle size={14} className="text-red-500" />;
    return <Loader2 size={14} className="animate-spin text-amber-500" />;
  };

  const statusLabel = (status: string) => {
    if (status === 'ready') return '就绪';
    if (status === 'ready_subtitles') return '可观看';
    if (status === 'error') return '失败';
    return '处理中';
  };

  const statusClass = (status: string) => {
    if (status === 'ready') return 'bg-green-50 text-green-700';
    if (status === 'ready_subtitles') return 'bg-coral/10 text-coral';
    if (status === 'error') return 'bg-red-50 text-red-700';
    return 'bg-amber-50 text-amber-700';
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 size={24} className="animate-spin text-coral" />
      </main>
    );
  }

  return (
    <main>
      <section className="border-b border-hairline bg-canvas">
        <div className="container-page py-8 sm:py-12">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-4xl sm:text-5xl font-normal text-ink tracking-display-xl leading-tight">
                你好{user.name ? `，${user.name}` : ''}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {isPro ? 'Pro 会员，全部功能已解锁。' : '试用中。升级 Pro 解锁 AI 助手。'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">等级</label>
              <select
                value={user.level || ''}
                onChange={async (e) => {
                  const newLevel = e.target.value;
                  try {
                    const updated = await api<User>('/api/v1/users/me', {
                      method: 'PATCH',
                      body: JSON.stringify({ level: newLevel || null }),
                    });
                    setUser(updated);
                    toast.success(`等级已设为 ${newLevel}`);
                  } catch {
                    toast.error('设置失败');
                  }
                }}
                className="rounded-md border border-hairline bg-canvas px-3 py-1.5 text-sm text-ink focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20"
              >
                <option value="">未设置</option>
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            {!isPro && (
              <button onClick={handleUpgrade} disabled={upgrading} className="btn-primary">
                <Sparkles size={14} />
                {upgrading ? '处理中...' : '升级 Pro'}
              </button>
            )}
          </div>
        </div>
      </section>

      {isPro && aiStats && (
        <section className="container-page py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: '跟读次数', value: aiStats.total_speaking_attempts, icon: Mic },
              { label: '准确率', value: aiStats.average_accuracy + '%', icon: BarChart3 },
              { label: '词汇量', value: aiStats.vocabulary_count, icon: BookOpen },
              { label: '视频数', value: aiStats.videos_watched, icon: Play },
            ].map((s) => (
              <div key={s.label} className="card-outline !p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <s.icon size={14} /> {s.label}
                </div>
                <p className="mt-1.5 font-display text-3xl font-normal text-ink tracking-display-sm">{s.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {isPro && (
        <section className="container-page pb-6">
          <div className="card-dark !p-6">
            {loadingAI ? (
              <p className="text-sm text-white/70 font-sans">AI 思考中...</p>
            ) : (
              <div className="space-y-4">
                {aiSummary && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-caption-wide text-coral">学习总结</h3>
                    <p className="mt-1.5 text-sm text-white/80 leading-relaxed">{aiSummary}</p>
                  </div>
                )}
                {recommendation && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-caption-wide text-coral">今日推荐</h3>
                    <p className="mt-1.5 text-sm text-white/80 leading-relaxed">{recommendation}</p>
                  </div>
                )}
                {!aiSummary && !recommendation && (
                  <p className="text-sm text-white/60 font-sans">开始学习后，AI 会在这里总结你的学习进度。</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="container-page pb-8">
        <h2 className="font-display text-2xl font-normal text-ink tracking-display-md">添加视频</h2>
        <form onSubmit={handleSubmitLink} className="mt-4 flex gap-3">
          <div className="relative flex-1">
            <Youtube size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="粘贴 YouTube 视频链接..."
              className="input-field pl-11" required
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary whitespace-nowrap">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? '处理中...' : '开始学习'}
          </button>
        </form>
      </section>

      <section className="container-page pb-8">
        <h2 className="font-display text-2xl font-normal text-ink tracking-display-md">搜索 YouTube</h2>
        <form onSubmit={handleSearch} className="mt-4 flex gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索英文视频，如 English interview, TED talk..."
              className="input-field pl-11"
            />
          </div>
          <button type="submit" disabled={searching || !searchQuery.trim()} className="btn-primary whitespace-nowrap">
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {searching ? '搜索中...' : '搜索'}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {searchResults.map((item) => (
              <div key={item.video_id} className="rounded-lg border border-hairline bg-canvas overflow-hidden hover:border-coral/30 hover:shadow-sm transition-all">
                <div className="relative aspect-video bg-cream-soft">
                  {item.thumbnail_url && <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="p-3.5">
                  <p className="text-sm font-medium text-ink line-clamp-2">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{item.channel_title}</p>
                  <button
                    onClick={() => addFromSearch(item.url, item.video_id)}
                    disabled={addingId === item.video_id}
                    className="mt-3 btn-primary w-full justify-center !py-2 text-xs"
                  >
                    {addingId === item.video_id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {addingId === item.video_id ? '添加中...' : '加入学习'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="container-page pb-16">
        <h2 className="font-display text-2xl font-normal text-ink tracking-display-md">我的视频库</h2>
        {videos.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-lg border-2 border-dashed border-hairline py-16">
            <Play size={32} className="text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">还没有视频</p>
            <p className="mt-1 text-xs text-muted-foreground">粘贴一个链接，开启第一课。</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <button
                key={v.id}
                onClick={() => (v.status === 'ready' || v.status === 'ready_subtitles') && router.push(`/watch/${v.id}`)}
                disabled={v.status !== 'ready' && v.status !== 'ready_subtitles'}
                className="group rounded-lg border border-hairline bg-canvas p-0 text-left overflow-hidden hover:border-coral/30 hover:shadow-sm transition-all disabled:cursor-default disabled:hover:border-hairline disabled:hover:shadow-none"
              >
                <div className="relative aspect-video bg-cream-soft flex items-center justify-center">
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Play size={32} className="text-muted-foreground group-hover:text-coral transition-colors" />
                  )}
                  {v.duration && (v.status === 'ready' || v.status === 'ready_subtitles') && (
                    <span className="absolute bottom-2 right-2 rounded-sm bg-ink/80 px-1.5 py-0.5 text-xs text-white">
                      {Math.floor(v.duration / 60)}:{String(Math.floor(v.duration % 60)).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <div className="p-3.5">
                  <p className="text-sm font-medium text-ink line-clamp-2">
                    {v.title === 'Processing...' ? '处理中...' : v.title}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className={cn('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium', statusClass(v.status))}>
                      {statusIcon(v.status)} {statusLabel(v.status)}
                    </span>
                    {v.difficulty_level && (
                      <span className="rounded-sm bg-cream-soft px-1.5 py-0.5 text-xs text-muted-foreground">{v.difficulty_level}</span>
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