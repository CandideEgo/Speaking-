"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Cpu,
  Crown,
  Flag,
  Loader2,
  RefreshCw,
  ServerCog,
  UserPlus,
  Users,
  Video,
} from "lucide-react";

import { SectionCard } from "@/components/admin/SectionCard";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/Button";
import type { AdminStats } from "@/types";
import {
  getAdminStats,
  getUgcPendingCount,
  getWorkerStatus,
} from "@/lib/adminData";

interface UgcPending {
  pending_processing: number;
  pending_review: number;
  total: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [ugc, setUgc] = useState<UgcPending | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, w, u] = await Promise.all([
        getAdminStats(),
        getWorkerStatus()
          .then((d) => d.worker_online)
          .catch(() => null),
        getUgcPendingCount().catch(() => null),
      ]);
      setStats(s);
      setWorkerOnline(w);
      setUgc(u);
    } catch {
      toast.error("加载概览失败");
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

  const pendingProcessing = ugc?.pending_processing ?? 0;
  const pendingReview = ugc?.pending_review ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">运营概览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            实时掌握平台运行状态
          </p>
        </div>
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

      {/* 实时在线 + 管线健康 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label="实时在线"
          value={stats.online_now}
          tone="coral"
        />
        <StatCard
          icon={ServerCog}
          label="GPU Worker"
          value={
            workerOnline === null ? "未知" : workerOnline ? "在线" : "离线"
          }
          tone={workerOnline ? "green" : "amber"}
        />
        <StatCard
          icon={Cpu}
          label="GPU 队列"
          value={stats.gpu_queue_depth}
          tone={stats.gpu_queue_depth > 0 ? "amber" : "default"}
        />
        <StatCard
          icon={AlertTriangle}
          label="视频失败"
          value={stats.videos_error_count}
          tone={stats.videos_error_count > 0 ? "amber" : "default"}
        />
      </div>

      {/* 用户结构 */}
      <SectionCard title="用户结构" description="会员分布与今日增长">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="总用户数"
            value={stats.total_users.toLocaleString()}
            delta={`今日 +${stats.signups_today}`}
            tone="coral"
          />
          <StatCard
            icon={Crown}
            label="Pro 用户"
            value={stats.pro_users.toLocaleString()}
            delta={`今日兑换 ${stats.redeems_today}`}
            tone="amber"
          />
          <StatCard
            icon={UserPlus}
            label="今日新增"
            value={stats.signups_today}
            tone="green"
          />
          <StatCard
            icon={CreditCard}
            label="今日兑换"
            value={stats.redeems_today}
            tone="green"
          />
        </div>
      </SectionCard>

      {/* UGC 待处理 */}
      <SectionCard
        title="UGC 待处理"
        description="待处理与待审核的用户提交视频"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={Video}
            label="待处理"
            value={pendingProcessing}
            tone={pendingProcessing > 0 ? "amber" : "default"}
          />
          <StatCard
            icon={Flag}
            label="待审核"
            value={pendingReview}
            tone={pendingReview > 0 ? "amber" : "default"}
          />
          <StatCard icon={Video} label="合计" value={ugc?.total ?? 0} />
        </div>
      </SectionCard>

      {/* 快捷入口 */}
      <SectionCard title="快捷入口">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/admin/stats", label: "统计详情" },
            { href: "/admin/videos", label: "视频管理" },
            { href: "/admin/users", label: "用户管理" },
            { href: "/admin/invites", label: "兑换码管理" },
            { href: "/admin/community", label: "社区管理" },
            { href: "/admin/orders", label: "订单管理" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center justify-between rounded-md border border-hairline bg-canvas px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-coral hover:text-coral"
            >
              {l.label}
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      </SectionCard>

      <div className="text-xs text-muted-soft">
        最后刷新时间 {new Date().toLocaleTimeString()}。
      </div>
    </div>
  );
}
