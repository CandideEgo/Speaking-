"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/common/ErrorState";
import { PageTransition } from "@/components/common/PageTransition";
import { User as UserIcon, Settings, TrendingUp } from "lucide-react";
import ProfileTab from "@/components/profile/ProfileTab";
import SettingsTab from "@/components/profile/SettingsTab";
import { MasteryTrend } from "@/components/profile/MasteryTrend";
import { MilestoneGrid } from "@/components/profile/MilestoneBadge";
import { Confetti } from "@/components/common/Confetti";
import { HeatmapCalendar, type HeatmapDay } from "@/components/profile/HeatmapCalendar";
import {
  EventDistributionChart,
  type EventDistributionItem,
} from "@/components/profile/EventDistributionChart";
import { useMilestoneCelebration } from "@/hooks/useMilestoneCelebration";

import { EXAM_LEVELS } from "@/lib/examLevels";
import { cn } from "@/lib/utils";
import type {
  User,
  UserPreferences,
  Milestone,
  Paginated,
  LearningRecord,
  LearningProfile,
} from "@/types";

interface VocabStats {
  total: number;
  mastered_count: number;
}

/** 手机号掩码：138****8855（原型 07 user-meta）。 */
function maskPhone(phone: string | null): string {
  if (!phone) return "";
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

/** 加入天数。 */
function daysSince(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function targetLabel(preferences: UserPreferences | null): string | null {
  const key = preferences?.target_exam;
  if (!key) return null;
  return EXAM_LEVELS.find((l) => l.key === key)?.label ?? null;
}

// 1B 设计减法：原「账户设置」「学习偏好」两个低频小表单 Tab 合并为单个「设置」。
const TABS = [
  { key: "profile", label: "个人资料", icon: UserIcon },
  { key: "progress", label: "学习进度", icon: TrendingUp },
  { key: "settings", label: "设置", icon: Settings },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // D5: weekly stats, event distribution, heatmap (all best-effort)
  const [weeklyStats, setWeeklyStats] = useState<{
    this_week_minutes: number;
    last_week_minutes: number;
    week_delta_pct: number | null;
    daily_minutes: { date: string; minutes: number }[];
  } | null>(null);
  const [eventDist, setEventDist] = useState<EventDistributionItem[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  // D9: 最新一期周报（有报告才显示入口）
  const [latestReport, setLatestReport] = useState<{ week_start: string } | null>(null);
  useEffect(() => {
    if (activeTab !== "progress") return;
    api<typeof weeklyStats>("/api/v1/learning/stats/weekly")
      .then(setWeeklyStats)
      .catch(() => {});
    api<EventDistributionItem[]>("/api/v1/learning/stats/event-distribution?days=30")
      .then(setEventDist)
      .catch(() => {});
    api<HeatmapDay[]>("/api/v1/learning/stats/heatmap?days=90")
      .then(setHeatmap)
      .catch(() => {});
    api<{ week_start: string }>("/api/v1/learning/weekly-reports/latest")
      .then(setLatestReport)
      .catch(() => setLatestReport(null));
  }, [activeTab]);

  // D5: milestone celebration (confetti)
  const celebration = useMilestoneCelebration();
  const [vocabStats, setVocabStats] = useState<VocabStats | null>(null);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);
  const [recordsTotal, setRecordsTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user + preferences once auth is initialized
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    let cancelled = false;
    setLoading(true);

    async function loadData() {
      try {
        const [u, p, m, vs, rec, lp] = await Promise.allSettled([
          api<User>("/api/v1/users/me"),
          api<UserPreferences>("/api/v1/users/me/preferences"),
          api<Milestone[]>("/api/v1/plan/milestones"),
          api<VocabStats>("/api/v1/vocabulary/stats"),
          api<Paginated<LearningRecord>>("/api/v1/learning/records?page=1&page_size=1"),
          api<LearningProfile>("/api/v1/plan/profile"),
        ]);
        if (cancelled) return;
        if (u.status === "fulfilled") setUser(u.value);
        else router.push("/login");
        if (p.status === "fulfilled") setPreferences(p.value);
        if (m.status === "fulfilled") setMilestones(m.value);
        if (vs.status === "fulfilled") setVocabStats(vs.value);
        if (rec.status === "fulfilled") setRecordsTotal(rec.value.total ?? null);
        if (lp.status === "fulfilled") setLearningProfile(lp.value);
      } catch {
        toast.error("加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="w-8 h-8 border-2 border-muted-soft border-t-ink rounded-full animate-spin" />
      </main>
    );
  }

  if (!user) {
    return (
      <ErrorState title="加载账户信息失败" onRetry={() => window.location.reload()} fullPage />
    );
  }

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-12">
        {/* Header */}
        <PageHeader crumb="个人设置" title="账户管理" />

        {/* 用户卡（原型 07 user-card）：头像 + 身份 + 学习统计 */}
        <div className="flex items-center gap-4 bg-canvas border border-hairline rounded-xl p-5 mb-7">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name ?? "头像"}
              className="w-16 h-16 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {(user.name ?? "学").slice(0, 1)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-ink flex items-center gap-2 flex-wrap">
              {user.name || "学习者"}
              {/* 内测期免费开放（需求 §2.3）：不引入 Pro 概念。 */}
              <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-pill bg-brand-50 text-brand-600">
                内测免费
              </span>
            </div>
            <div className="text-[13px] text-muted mt-1 flex items-center gap-2 flex-wrap">
              {user.phone && <span>{maskPhone(user.phone)}</span>}
              {targetLabel(preferences) && (
                <>
                  <span>·</span>
                  <span>目标：{targetLabel(preferences)}</span>
                </>
              )}
              <span>·</span>
              <span>加入 {daysSince(user.created_at)} 天</span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-6">
            {[
              { n: recordsTotal, l: "已学视频" },
              { n: vocabStats?.mastered_count, l: "掌握词汇" },
              { n: learningProfile?.current_streak, l: "连续天数" },
            ].map((s) => (
              <div key={s.l} className="text-center">
                <div className="text-xl font-extrabold font-mono text-ink">{s.n ?? "–"}</div>
                <div className="text-[11px] text-muted mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-hairline mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer",
                activeTab === tab.key
                  ? "border-brand-500 text-brand-500"
                  : "border-transparent text-muted hover:text-ink"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "profile" && <ProfileTab user={user} onUpdate={setUser} />}
        {activeTab === "progress" && (
          <div className="max-w-2xl space-y-6">
            {/* D9：周报入口（有报告才显示，不足一周不出现） */}
            {latestReport && (
              <Link
                href="/weekly-report"
                className="flex items-center justify-between bg-canvas border border-hairline rounded-xl p-5 hover:border-brand-500/40 transition-colors group"
              >
                <div>
                  <h2 className="text-sm font-semibold text-ink">学习周报</h2>
                  <p className="text-xs text-muted mt-1">
                    最新一期：{latestReport.week_start} 周 · 每周一自动生成，可保存分享卡片
                  </p>
                </div>
                <span className="text-brand-500 text-sm font-semibold group-hover:translate-x-0.5 transition-transform">
                  查看 →
                </span>
              </Link>
            )}
            {/* D3a：周循环回顾（从首页移入，只回顾不施压）：
                一天内集齐 观看/词汇/练习/复习 四类行为 = 1 个完整闭环。 */}
            <div>
              <h2 className="text-sm font-semibold text-ink mb-4">学习闭环</h2>
              <div className="bg-canvas border border-hairline rounded-xl p-5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {[
                    { icon: "🎬", label: "看视频" },
                    { icon: "📚", label: "查词汇" },
                    { icon: "✍️", label: "做练习" },
                    { icon: "🔁", label: "复习" },
                  ].map((t, i) => (
                    <span key={t.label} className="inline-flex items-center gap-1">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-soft text-[13px] font-medium text-ink">
                        <span aria-hidden>{t.icon}</span>
                        {t.label}
                      </span>
                      {i < 3 && <span className="text-muted-soft text-xs">+</span>}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[13px] text-muted">
                  一天内集齐四类学习行为即完成 1 个闭环，你已累计完成{" "}
                  <span className="font-semibold text-ink">
                    {learningProfile?.weekly_cycles_completed ?? 0}
                  </span>{" "}
                  个闭环。
                </p>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink mb-4">掌握度趋势</h2>
              <MasteryTrend weeks={8} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink mb-4">本周学习时长</h2>
              <div className="bg-canvas border border-hairline rounded-xl p-5">
                {weeklyStats ? (
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-ink tabular-nums">
                        {weeklyStats.this_week_minutes}
                      </span>
                      <span className="text-sm text-muted">分钟</span>
                      {weeklyStats.week_delta_pct !== null && weeklyStats.last_week_minutes > 0 && (
                        <span
                          className={
                            "text-xs font-semibold ml-auto " +
                            (weeklyStats.week_delta_pct >= 0 ? "text-success" : "text-error")
                          }
                        >
                          {weeklyStats.week_delta_pct >= 0 ? "↑" : "↓"}{" "}
                          {Math.abs(weeklyStats.week_delta_pct)}% vs 上周
                        </span>
                      )}
                    </div>
                    <div className="flex items-end gap-1.5 h-12">
                      {weeklyStats.daily_minutes.map((d, i) => {
                        const max = Math.max(1, ...weeklyStats.daily_minutes.map((x) => x.minutes));
                        const h = (d.minutes / max) * 100;
                        const labels = ["一", "二", "三", "四", "五", "六", "日"];
                        return (
                          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full bg-brand-500 rounded-t"
                              style={{ height: h + "%", minHeight: 2 }}
                              title={d.date + " · " + d.minutes + " 分钟"}
                            />
                            <span className="text-[9px] text-muted-soft">{labels[i] ?? ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted text-center py-4">加载中…</div>
                )}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink mb-4">事件占比（近 30 天）</h2>
              <div className="bg-canvas border border-hairline rounded-xl p-5">
                <EventDistributionChart data={eventDist} />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink mb-4">活动热力图（90 天）</h2>
              <div className="bg-canvas border border-hairline rounded-xl p-5">
                <HeatmapCalendar days={heatmap} range={90} />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink mb-4">成就徽章</h2>
              <MilestoneGrid milestones={milestones} />
            </div>
          </div>
        )}
        {activeTab === "settings" && (
          <SettingsTab user={user} preferences={preferences} onUpdatePreferences={setPreferences} />
        )}
      </main>
      <Confetti
        fire={!!celebration.current}
        onDone={() => celebration.current && celebration.acknowledge(celebration.current)}
      />
    </PageTransition>
  );
}
