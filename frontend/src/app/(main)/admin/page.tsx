'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { User, Video } from '@/types';
import { cn } from '@/lib/utils';
import {
  VideoIcon, Ticket, Plus, Download, RefreshCw, Loader2, ShieldAlert,
} from 'lucide-react';

interface InviteCode {
  id: string; code: string; plan: string; duration_days: number;
  is_used: boolean; used_by: string | null; batch_label: string | null; created_at: string;
}

type AdminTab = 'videos' | 'invites';

export default function AdminPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<AdminTab>('videos');
  const [loading, setLoading] = useState(true);
  const [seedUrl, setSeedUrl] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [codeCount, setCodeCount] = useState(10);
  const [codeDuration, setCodeDuration] = useState(30);
  const [codeLabel, setCodeLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    api<User>('/api/v1/users/me')
      .then((u) => {
        setUser(u);
        if (u.role !== 'admin') { toast.error('需要管理员权限'); router.push('/dashboard'); }
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => { if (tab === 'invites') loadCodes(); }, [tab]);

  async function handleSeed(e: React.FormEvent) {
    e.preventDefault();
    if (!seedUrl.trim()) return;
    setSeeding(true);
    try {
      await api<Video>('/api/v1/videos/seed', { method: 'POST', body: JSON.stringify({ source_url: seedUrl }) });
      toast.success('视频已加入处理队列');
      setSeedUrl('');
    } catch (err) { toast.error(err instanceof Error ? err.message : '种植失败'); }
    finally { setSeeding(false); }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    try {
      const generated = await api<InviteCode[]>('/api/v1/invite-codes/generate', {
        method: 'POST',
        body: JSON.stringify({ count: codeCount, plan: 'pro', duration_days: codeDuration, batch_label: codeLabel || undefined }),
      });
      toast.success(`已生成 ${generated.length} 个兑换码`);
      setCodes((prev) => [...generated, ...prev]);
    } catch (err) { toast.error(err instanceof Error ? err.message : '生成失败'); }
    finally { setGenerating(false); }
  }

  async function loadCodes() {
    setLoadingCodes(true);
    try {
      const data = await api<{ items: InviteCode[]; page: number; page_size: number; has_more: boolean }>('/api/v1/invite-codes?page=1&page_size=100');
      setCodes(data.items);
    } catch { toast.error('加载兑换码失败'); }
    finally { setLoadingCodes(false); }
  }

  async function exportCsv() {
    try {
      const data = await api<{ csv: string; total: number }>('/api/v1/invite-codes/export');
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `invite-codes-${new Date().toISOString().split('T')[0]}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`已导出 ${data.total} 个兑换码`);
    } catch { toast.error('导出失败'); }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-canvas"><Loader2 size={24} className="animate-spin text-coral" /></main>;
  if (!user || user.role !== 'admin') return <main className="flex min-h-screen items-center justify-center bg-canvas"><div className="text-center"><ShieldAlert size={48} className="mx-auto text-muted-foreground" /><p className="mt-4 text-muted-foreground">需要管理员权限</p></div></main>;

  return (
    <main className="container-page py-8">
      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl font-normal text-ink tracking-display-xl">管理后台</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理内容和兑换码</p>
        </div>
        <div className="flex rounded-md border border-hairline bg-canvas p-0.5">
          {([['videos', '视频', VideoIcon], ['invites', '兑换码', Ticket]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('inline-flex items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-medium transition-colors',
                tab === key ? 'bg-coral text-white' : 'text-muted-foreground hover:text-ink')}>
              <Icon size={16} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'videos' && (
        <div className="card-outline">
          <h2 className="font-display text-2xl text-ink">种植官方视频</h2>
          <p className="mt-1 text-sm text-muted-foreground">提交视频链接以为首页种植官方内容。</p>
          <form onSubmit={handleSeed} className="mt-4 flex gap-3">
            <input type="url" value={seedUrl} onChange={(e) => setSeedUrl(e.target.value)} placeholder="YouTube 或 Bilibili 链接..." className="input-field flex-1" required />
            <button type="submit" disabled={seeding} className="btn-primary whitespace-nowrap"><Plus size={16} />{seeding ? '处理中...' : '种植视频'}</button>
          </form>
        </div>
      )}

      {tab === 'invites' && (
        <div className="space-y-6">
          <div className="card-outline">
            <h2 className="font-display text-2xl text-ink">生成兑换码</h2>
            <form onSubmit={handleGenerate} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">数量</label><input type="number" value={codeCount} onChange={(e) => setCodeCount(Number(e.target.value))} min={1} max={500} className="input-field" /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">有效期（天）</label><input type="number" value={codeDuration} onChange={(e) => setCodeDuration(Number(e.target.value))} min={1} max={3650} className="input-field" /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">批次标签</label><input type="text" value={codeLabel} onChange={(e) => setCodeLabel(e.target.value)} placeholder="例: batch-2024Q1" className="input-field" /></div>
              </div>
              <button type="submit" disabled={generating} className="btn-primary"><Ticket size={16} />{generating ? '生成中...' : '生成兑换码'}</button>
            </form>
          </div>

          <div className="card-outline">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-display text-2xl text-ink">兑换码列表</h2>
              <div className="flex gap-2">
                <button onClick={loadCodes} disabled={loadingCodes} className="btn-secondary !py-2 !px-3 text-xs"><RefreshCw size={12} className={loadingCodes ? 'animate-spin' : ''} />刷新</button>
                <button onClick={exportCsv} className="btn-secondary !py-2 !px-3 text-xs"><Download size={12} />导出 CSV</button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-hairline text-left text-xs text-muted-foreground uppercase tracking-wider"><th className="pb-2 font-medium">兑换码</th><th className="pb-2 font-medium">方案</th><th className="pb-2 font-medium">有效期</th><th className="pb-2 font-medium">批次</th><th className="pb-2 font-medium">状态</th><th className="pb-2 font-medium">使用者</th></tr></thead>
                <tbody className="divide-y divide-hairline">
                  {codes.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">{loadingCodes ? '加载中...' : '暂无兑换码'}</td></tr> :
                    codes.map((c) => (
                      <tr key={c.id} className="text-xs">
                        <td className="py-2 font-mono text-ink">{c.code}</td>
                        <td className="py-2 text-muted-foreground">{c.plan}</td>
                        <td className="py-2 text-muted-foreground">{c.duration_days}天</td>
                        <td className="py-2 text-muted-foreground">{c.batch_label || '-'}</td>
                        <td className="py-2"><span className={cn('inline-flex rounded-sm px-2 py-0.5 text-[10px] font-medium', c.is_used ? 'bg-cream-soft text-muted-foreground' : 'bg-green-50 text-green-700')}>{c.is_used ? '已使用' : '可用'}</span></td>
                        <td className="py-2 text-muted-foreground font-mono">{c.used_by ? c.used_by.slice(0, 8) + '...' : '-'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}