"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  BookOpen,
  Cpu,
  CreditCard,
  Crown,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
  Video,
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
import { AdminPageHeader, AdminSkeleton } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import type { AdminStats, RecentActivityType } from "@/types";
import { getAdminStats } from "@/lib/adminData";
import { useChartTheme } from "@/lib/chart-theme";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  ready: "就绪",
  ready_subtitles: "字幕就绪",
  processing: "处理中",
  error: "失败",
};

const ACTIVITY_ICON: Record<RecentActivityType, React.ElementType> = {
  signup: UserPlus,
  payment: CreditCard,
};

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  delta?: string;
  tone?: "default" | "brand" | "green" | "amber";
}) {
  const toneStyles = {
    default: "bg-surface-soft text-muted",
    brand: "bg-brand-50 text-brand-600",
    green: "bg-success-soft text-success",
    amber: "bg-warning-soft text-warning",
  }[tone];

  return (
    <div className="rounded-xl border border-hairline bg-canvas p-5">
      <div className="flex items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", toneStyles)}>
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-4 text-2xl font-semibold text-ink">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-xs text-muted">{label}</p>
        {delta && (
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
            <TrendingUp size={12} />
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Card
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-canvas p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminStatsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30>(30);
  const ct = useChartTheme();

  const PLAN_COLORS: Record<string, string> = {
    free: ct.series.neutral,
    pro: ct.series.brand,
  };

  const STATUS_COLORS: Record<string, string> = {
    ready: ct.series.success,
    ready_subtitles: ct.series.warning,
    processing: ct.series.yellow,
    error: ct.series.error,
  };

  const load = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const data = await getAdminStats(days);
      setStats(data);
    } catch {
      toast.error("加载统计数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  if (loading || !stats) {
    return <AdminSkeleton.Page />;
  }

  const slice = range;
  const startIdx = stats.trend.dates.length - slice;
  const trend = stats.trend.dates.slice(-slice).map((date, i) => ({
    date,
    signups: stats.trend.signups[startIdx + i],
    vocabulary: stats.trend.vocabulary[startIdx + i],
    active: stats.trend.active_users[startIdx + i],
  }));

  const newVocab7d = stats.trend.vocabulary.slice(-7).reduce((a, b) => a + b, 0);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  const planData = stats.users_by_plan.map((p) => ({
    name: p.plan === "pro" ? "Pro" : "Free",
    value: p.count,
    color: PLAN_COLORS[p.plan] || ct.series.neutral,
  }));

  const statusData = stats.videos_by_status.map((s) => ({
    name: STATUS_LABEL[s.status] || s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] || ct.series.neutral,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title="数据统计"
        description="平台核心指标与趋势分析"
        actions={
          <Button
            onClick={() => load(range)}
            disabled={loading}
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            className={loading ? "[&_svg]:animate-spin" : ""}
          >
            刷新
          </Button>
        }
      />

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="总用户数"
          value={stats.total_users.toLocaleString()}
          delta={`+${stats.signups_today} 今日`}
          tone="brand"
        />
        <KpiCard
          icon={UserPlus}
          label="今日新增"
          value={stats.signups_today}
          delta={`7日 ${stats.new_users_7d}`}
          tone="green"
        />
        <KpiCard
          icon={Crown}
          label="Pro 用户"
          value={stats.pro_users.toLocaleString()}
          delta={`${stats.redeems_today} 兑换`}
          tone="amber"
        />
        <KpiCard icon={Activity} label="实时在线" value={stats.online_now} tone="brand" />
        <KpiCard
          icon={Video}
          label="视频总数"
          value={stats.total_videos}
          delta={`${stats.videos_ready} 就绪`}
        />
        <KpiCard
          icon={BookOpen}
          label="词汇总数"
          value={stats.total_vocabulary.toLocaleString()}
          delta={`+${newVocab7d} 近7日`}
          tone="green"
        />
        <KpiCard
          icon={Cpu}
          label="GPU 队列"
          value={stats.gpu_queue_depth}
          tone={stats.gpu_queue_depth > 0 ? "amber" : "default"}
        />
        <KpiCard
          icon={Video}
          label="失败视频"
          value={stats.videos_error_count}
          tone={stats.videos_error_count > 0 ? "amber" : "default"}
        />
      </div>

      {/* Trend Chart */}
      <ChartCard
        title="平台趋势"
        description="注册、新增词汇与活跃用户"
        actions={
          <div className="flex rounded-lg border border-hairline bg-surface-soft p-0.5">
            {([7, 30] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  range === r ? "bg-canvas text-ink shadow-sm" : "text-muted hover:text-ink"
                )}
              >
                {r} 天
              </button>
            ))}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="gSignups" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ct.series.brand} stopOpacity={0.2} />
                <stop offset="95%" stopColor={ct.series.brand} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gVocab" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ct.series.success} stopOpacity={0.2} />
                <stop offset="95%" stopColor={ct.series.success} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gActive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ct.series.indigo} stopOpacity={0.2} />
                <stop offset="95%" stopColor={ct.series.indigo} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: ct.tick }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11, fill: ct.tick }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                ...ct.tooltipStyle,
                borderRadius: "8px",
              }}
              labelFormatter={(label) => formatDate(String(label))}
            />
            <Area
              type="monotone"
              dataKey="vocabulary"
              stroke={ct.series.success}
              strokeWidth={2}
              fill="url(#gVocab)"
              name="新增词汇"
            />
            <Area
              type="monotone"
              dataKey="active"
              stroke={ct.series.indigo}
              strokeWidth={2}
              fill="url(#gActive)"
              name="活跃用户"
            />
            <Area
              type="monotone"
              dataKey="signups"
              stroke={ct.series.brand}
              strokeWidth={2}
              fill="url(#gSignups)"
              name="新增注册"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Distribution Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="用户方案分布">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={planData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={2}
              >
                {planData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ ...ct.tooltipStyle, borderRadius: "8px" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2">
            {planData.map((p) => (
              <div key={p.name} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-xs text-muted">
                  {p.name}: {p.value}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="视频状态分布">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statusData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: ct.tick }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: ct.tick }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={{ ...ct.tooltipStyle, borderRadius: "8px" }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {statusData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Recent Activity */}
      <ChartCard title="最近活动">
        <div className="space-y-1">
          {stats.recent_activity.map((a) => {
            const Icon = ACTIVITY_ICON[a.type] || TrendingUp;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-soft/50 transition-colors"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    a.type === "signup"
                      ? "bg-brand-50 text-brand-500"
                      : "bg-success-soft text-success"
                  )}
                >
                  <Icon size={14} />
                </span>
                <span className="flex-1 text-sm text-body">{a.summary}</span>
                <span className="text-xs text-muted-soft">
                  {new Date(a.created_at).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
}
