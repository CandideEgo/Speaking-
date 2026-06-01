'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, getToken } from '@/lib/api';
import type { User, Video } from '@/types';
import { cn } from '@/lib/utils';
import {
  VideoIcon,
  Ticket,
  Plus,
  Download,
  RefreshCw,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

interface InviteCode {
  id: string;
  code: string;
  plan: string;
  duration_days: number;
  is_used: boolean;
  used_by: string | null;
  batch_label: string | null;
  created_at: string;
}

type AdminTab = 'videos' | 'invites';

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<AdminTab>('videos');
  const [loading, setLoading] = useState(true);

  // Video seed form
  const [seedUrl, setSeedUrl] = useState('');
  const [seeding, setSeeding] = useState(false);

  // Invite code form
  const [codeCount, setCodeCount] = useState(10);
  const [codeDuration, setCodeDuration] = useState(30);
  const [codeLabel, setCodeLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    api<User>('/api/v1/users/me')
      .then((u) => {
        setUser(u);
        if (u.role !== 'admin') {
          toast.error('Admin access required');
          router.push('/dashboard');
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (tab === 'invites') loadCodes();
  }, [tab]);

  async function handleSeed(e: React.FormEvent) {
    e.preventDefault();
    if (!seedUrl.trim()) return;
    setSeeding(true);
    try {
      await api<Video>('/api/v1/videos/seed', {
        method: 'POST',
        body: JSON.stringify({ source_url: seedUrl }),
      });
      toast.success('Video queued for processing');
      setSeedUrl('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to seed video');
    } finally {
      setSeeding(false);
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    try {
      const generated = await api<InviteCode[]>('/api/v1/invite-codes/generate', {
        method: 'POST',
        body: JSON.stringify({
          count: codeCount,
          plan: 'pro',
          duration_days: codeDuration,
          batch_label: codeLabel || undefined,
        }),
      });
      toast.success(`Generated ${generated.length} codes`);
      setCodes((prev) => [...generated, ...prev]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function loadCodes() {
    setLoadingCodes(true);
    try {
      const data = await api<InviteCode[]>('/api/v1/invite-codes?limit=100');
      setCodes(data);
    } catch {
      toast.error('Failed to load invite codes');
    } finally {
      setLoadingCodes(false);
    }
  }

  async function exportCsv() {
    try {
      const data = await api<{ csv: string; total: number }>('/api/v1/invite-codes/export');
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invite-codes-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.total} codes`);
    } catch {
      toast.error('Export failed');
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 size={24} className="animate-spin text-brand-600" />
      </main>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <ShieldAlert size={48} className="mx-auto text-red-400" />
          <p className="mt-4 text-slate-600">Admin access required</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container-page py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">管理后台</h1>
          <p className="mt-1 text-sm text-slate-500">Admin Panel</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {([
            ['videos', '视频', VideoIcon],
            ['invites', '兑换码', Ticket],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium',
                tab === key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'videos' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">种植官方视频</h2>
          <p className="mt-1 text-sm text-slate-500">
            Submit video URLs to seed official content for the homepage.
          </p>
          <form onSubmit={handleSeed} className="mt-4 flex gap-3">
            <input
              type="url"
              value={seedUrl}
              onChange={(e) => setSeedUrl(e.target.value)}
              placeholder="YouTube or Bilibili URL..."
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              required
            />
            <button
              type="submit"
              disabled={seeding}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Plus size={16} />
              {seeding ? 'Processing...' : 'Seed Video'}
            </button>
          </form>
        </div>
      )}

      {tab === 'invites' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">生成兑换码</h2>
            <form onSubmit={handleGenerate} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">数量</label>
                  <input
                    type="number"
                    value={codeCount}
                    onChange={(e) => setCodeCount(Number(e.target.value))}
                    min={1}
                    max={500}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">有效期（天）</label>
                  <input
                    type="number"
                    value={codeDuration}
                    onChange={(e) => setCodeDuration(Number(e.target.value))}
                    min={1}
                    max={3650}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">批次标签</label>
                  <input
                    type="text"
                    value={codeLabel}
                    onChange={(e) => setCodeLabel(e.target.value)}
                    placeholder="e.g. batch-2024Q1"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Ticket size={16} />
                {generating ? 'Generating...' : 'Generate Codes'}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">兑换码列表</h2>
              <div className="flex gap-2">
                <button
                  onClick={loadCodes}
                  disabled={loadingCodes}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw size={12} className={loadingCodes ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Download size={12} />
                  Export CSV
                </button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="pb-2 font-medium">Code</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 font-medium">Duration</th>
                    <th className="pb-2 font-medium">Batch</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Used By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {codes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        {loadingCodes ? 'Loading...' : 'No invite codes yet'}
                      </td>
                    </tr>
                  ) : (
                    codes.map((c) => (
                      <tr key={c.id} className="text-xs">
                        <td className="py-2 font-mono text-slate-900">{c.code}</td>
                        <td className="py-2 text-slate-600">{c.plan}</td>
                        <td className="py-2 text-slate-600">{c.duration_days}d</td>
                        <td className="py-2 text-slate-500">{c.batch_label || '-'}</td>
                        <td className="py-2">
                          <span className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                            c.is_used ? 'bg-slate-100 text-slate-500' : 'bg-green-50 text-green-700'
                          )}>
                            {c.is_used ? 'Used' : 'Available'}
                          </span>
                        </td>
                        <td className="py-2 text-slate-500 font-mono">{c.used_by ? c.used_by.slice(0, 8) + '...' : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
