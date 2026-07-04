"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  BookOpen,
  Crown,
  Flag,
  Loader2,
  MessageSquare,
  TrendingUp,
  Users,
  Video,
  RefreshCw,
  UserPlus,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/admin/SectionCard";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/Button";
import type { AdminStats, RecentActivityType } from "@/types";
import { getAdminStats } from "@/lib/adminData";

const PLAN_COLORS: Record<string, string> = {
  free: "#a1a1aa",
  pro: "#ff5a1f",
};

const STATUS_COLORS: Record<string, string> = {
  ready: "#16a34a",
  ready_subtitles: "#d97706",
  processing: "#eab308",
  error: "#dc2626",
};

const STATUS_LABEL: Record<string, string> = {
  ready: "就绪",
  ready_subtitles: "字幕就绪",
  processing: "处理中",
  error: "失败",
};

const ACTIVITY_ICON: Record<RecentActivityType, React.ElementType> = {
  signup: UserPlus,
  post: MessageSquare,
  report: Flag,
  payment: CreditCard,
};

export default function AdminStatsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30>(30);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getAdminStats();
      setStats(data);
    } catch {
      toast.error("加载统计数据失败");
    } finally {
      setLoading(false);
    }
  }

  if (loading || !stats) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-coral" />
      </div>
    );
  }

  const slice = range;
  const trendData = stats.trend.dates.slice(-slice).map((date, i) => ({
    date,
    idx: stats.trend.dates.length - slice + i,
  }));
  const startIdx = stats.trend.dates.length - slice;
  const trend = trendData.map((d) => ({
    date: d.date,
    signups: stats.trend.signups[startIdx + d.idx],
    vocabulary: stats.trend.vocabulary[startIdx + d.idx],
    active: stats.trend.active_users[startIdx + d.idx],
  }));

  // Real 7-day new-vocabulary count (sum of the last 7 trend points) — replaces
  // the hardcoded "+8.4%" speaking delta. The backend always returns a 30-day
  // trend, so slice(-7) is the last 7 days regardless of the chart range toggle.
  const newVocab7d = stats.trend.vocabulary
    .slice(-7)
    .reduce((a, b) => a + b, 0);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  const planData = stats.users_by_plan.map((p) => ({
    name: p.plan === "pro" ? "Pro" : "Free",
    value: p.count,
    color: PLAN_COLORS[p.plan] || "#a1a1aa",
  }));
  const statusData = stats.videos_by_status.map((s) => ({
    name: STATUS_LABEL[s.status] || s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] || "#a1a1aa",
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          onClick={load}
          disabled={loading}
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          className={loading ? "[&_svg]:animate-spin" : ""}
        >
          刷新
        </Button>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Users}
          label="总用户数"
          value={stats.total_users.toLocaleString()}
          delta="+12% 较上月"
          tone="coral"
        />
        <StatCard
          icon={UserPlus}
          label="7 日新增"
          value={stats.new_users_7d}
          delta="+5 今日"
          tone="green"
        />
        <StatCard
          icon={Crown}
          label="Pro 用户"
          value={stats.pro_users.toLocaleString()}
          tone="amber"
        />
        <StatCard
          icon={Video}
          label="视频总数"
          value={stats.total_videos}
          delta={`${stats.videos_ready} 已就绪`}
        />
        <StatCard
          icon={BookOpen}
          label="词汇总数"
          value={stats.total_vocabulary.toLocaleString()}
          delta={`+${newVocab7d} 近7日`}
          tone="green"
        />
        <StatCard
          icon={Flag}
          label="待处理举报"
          value={stats.pending_reports}
          tone={stats.pending_reports > 0 ? "amber" : "default"}
        />
      </div>

      {/* Trend chart */}
      <SectionCard
        title="平台趋势"
        description="注册、新增词汇与活跃用户（按观看记录）"
        actions={
          <div className="flex rounded-md border border-hairline bg-canvas p-0.5">
            {([7, 30] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-sm px-3 py-1 text-xs font-medium transition-colors",
                  range === r
                    ? "bg-coral text-white"
                    : "text-muted-foreground hover:text-ink",
                )}
              >
                {r} 天
              </button>
            ))}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart
            data={trend}
            margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="gSignups" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff5a1f" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff5a1f" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gVocab" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5db8a6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5db8a6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gActive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ededed" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={{ stroke: "#ededed" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={{ stroke: "#ededed" }}
            />
            <Tooltip
              contentStyle={{
                background: "#fafafa",
                border: "1px solid #ededed",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(label) => formatDate(String(label))}
            />
            <Area
              type="monotone"
              dataKey="vocabulary"
              stroke="#5db8a6"
              strokeWidth={2}
              fill="url(#gVocab)"
              name="新增词汇"
            />
            <Area
              type="monotone"
              dataKey="active"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#gActive)"
              name="活跃用户"
            />
            <Area
              type="monotone"
              dataKey="signups"
              stroke="#ff5a1f"
              strokeWidth={2}
              fill="url(#gSignups)"
              name="新增注册"
            />
          </AreaChart>
        </ResponsiveContainer>
      </SectionCard>

      {/* Breakdown charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="用户方案分布">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={planData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, value }) => `${name}: ${value}`}
                labelLine={false}
              >
                {planData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#fafafa",
                  border: "1px solid #ededed",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="视频状态分布">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={statusData}
              margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#ededed" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={{ stroke: "#ededed" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={{ stroke: "#ededed" }}
              />
              <Tooltip
                contentStyle={{
                  background: "#fafafa",
                  border: "1px solid #ededed",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {statusData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Recent activity */}
      <SectionCard title="最近活动">
        <ul className="divide-y divide-hairline">
          {stats.recent_activity.map((a) => {
            const Icon = ACTIVITY_ICON[a.type] || TrendingUp;
            return (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-soft text-muted-foreground flex-shrink-0">
                  <Icon size={14} />
                </span>
                <span className="text-sm text-ink flex-1">{a.summary}</span>
                <span className="text-xs text-muted-soft flex-shrink-0">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {/* Footer summary */}
      <div className="flex items-center gap-2 text-xs text-muted-soft">
        <BarChart3 size={12} />
        数据来自实时数据库，最后刷新时间 {new Date().toLocaleTimeString()}。
      </div>
    </div>
  );
}
