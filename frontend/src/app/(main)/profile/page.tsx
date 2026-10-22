"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api, isProUser } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState } from "@/components/common/ErrorState";
import { PageTransition } from "@/components/common/PageTransition";
import { User as UserIcon, Settings, TrendingUp, Sparkles } from "lucide-react";
import ProfileTab from "@/components/profile/ProfileTab";
import SettingsTab from "@/components/profile/SettingsTab";
import { MasteryTrend } from "@/components/profile/MasteryTrend";
import {
  EventDistributionChart,
  type EventDistributionItem,
} from "@/components/profile/EventDistributionChart";
import { useProfileStore } from "@/stores/profileStore";

import { EXAM_LEVELS } from "@/lib/examLevels";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import type { User, UserPreferences, Paginated, LearningRecord } from "@/types";

interface VocabStats {
  total: number;
  mastered_count: number;
  due_count?: number;
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

// 设计稿三组（个人资料 / 学习设置 / 账号）；产品把学习统计拆成「学习进度」，
// 这里保留 4 个 tab，但补齐账号分组（改密/通知/导出/注销）与设计一致的键盘语义。
const TABS = [
  { key: "profile", label: "资料", longLabel: "个人资料", icon: UserIcon },
  { key: "progress", label: "进度", longLabel: "学习进度", icon: TrendingUp },
  { key: "account", label: "账号", longLabel: "账号", icon: Settings },
  { key: "settings", label: "设置", longLabel: "学习设置", icon: Settings },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const rawTab = searchParams.get("tab");
  const activeTab: TabKey = TABS.find((tab) => tab.key === rawTab)?.key ?? "profile";
  const setActiveTab = (tab: TabKey) => router.replace(`/profile?tab=${tab}`, { scroll: false });
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  // Basic activity records; no comprehension or achievement claims.
  const [weeklyStats, setWeeklyStats] = useState<{
    this_week_minutes: number;
    last_week_minutes: number;
    week_delta_pct: number | null;
    daily_minutes: { date: string; minutes: number }[];
  } | null>(null);
  const [eventDist, setEventDist] = useState<EventDistributionItem[]>([]);
  useEffect(() => {
    if (activeTab !== "progress") return;
    api<typeof weeklyStats>("/api/v1/learning/stats/weekly")
      .then(setWeeklyStats)
      .catch(() => {});
    api<EventDistributionItem[]>("/api/v1/learning/stats/event-distribution?days=30")
      .then(setEventDist)
      .catch(() => {});
  }, [activeTab]);

  const [vocabStats, setVocabStats] = useState<VocabStats | null>(null);
  const [recordsTotal, setRecordsTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Every path that lands a `/users/me` payload — the initial load below, plus the
  // PATCH / upload / phone-change handlers wired through `onUpdate` — publishes it to
  // the shared store, so the top bar's avatar follows along instead of going stale.
  const setMe = useProfileStore((s) => s.setMe);
  const applyUser = useCallback(
    (next: User) => {
      setUser(next);
      setMe({ url: next.avatar_url, gender: next.gender });
    },
    [setMe]
  );

  // Fetch user + preferences once auth is initialized
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    let cancelled = false;
    setLoading(true);

    async function loadData() {
      try {
        const [u, p, vs, rec] = await Promise.allSettled([
          api<User>("/api/v1/users/me", { cacheTtlMs: 30_000 }),
          api<UserPreferences>("/api/v1/users/me/preferences"),
          api<VocabStats>("/api/v1/vocabulary/stats"),
          api<Paginated<LearningRecord>>("/api/v1/learning/records?page=1&page_size=1"),
        ]);
        if (cancelled) return;
        if (u.status === "fulfilled") applyUser(u.value);
        if (p.status === "fulfilled") setPreferences(p.value);
        if (vs.status === "fulfilled") setVocabStats(vs.value);
        if (rec.status === "fulfilled") setRecordsTotal(rec.value.total ?? null);
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
  }, [isAuthenticated, isLoading, applyUser]);

  if (isLoading || loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas">
        <div className="w-8 h-8 border-2 border-muted-soft border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || (!preferences && activeTab === "settings")) {
    return (
      <ErrorState title="加载账户信息失败" onRetry={() => window.location.reload()} fullPage />
    );
  }

  const vocabDue = vocabStats?.due_count ?? 0;
  const vocabMastered = vocabStats?.mastered_count ?? 0;
  const vocabLater = Math.max(0, (vocabStats?.total ?? 0) - vocabDue - vocabMastered);
  const dailyMinutes = weeklyStats?.daily_minutes ?? [];
  const dailyMax = Math.max(1, ...dailyMinutes.map((d) => d.minutes));

  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = TABS[next].key;
    setActiveTab(key);
    requestAnimationFrame(() => document.getElementById(`profile-tab-${key}`)?.focus());
  }

  return (
    <PageTransition>
      {searchParams.get("retired") === "weekly-report" && (
        <p role="status" className="px-4 py-2 text-meta text-muted">
          周报功能已下线，观看记录和词汇仍保留。
        </p>
      )}
      <div className="user-page">
        <PageHeader
          crumb="我的"
          title="账户与学习设置"
          description="管理个人资料、学习偏好与账户安全。"
        />

        {/* 用户卡（原型 07 user-card）：头像 + 身份 + 学习统计 */}
        <Card padding={5} className="mt-6 flex items-center gap-4">
          <Avatar
            src={user.avatar_url}
            name={user}
            seed={user.id}
            gender={user.gender}
            size="xl"
            alt={user.name ?? "头像"}
          />
          <div className="flex-1 min-w-0">
            <div className="text-copy-lg font-bold text-ink flex items-center gap-2 flex-wrap">
              {user.name || "学习者"}
              {/* 会员状态由 plan + plan_expires_at 决定（isProUser 与后端 /payments/status 同口径）。 */}
              <span className="inline-flex items-center text-caption font-semibold px-2.5 py-0.5 rounded-pill bg-brand-50 text-brand-700">
                {isProUser(user) ? "会员" : "免费版"}
              </span>
            </div>
            <div className="text-copy text-muted mt-1 flex items-center gap-2 flex-wrap">
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
            ].map((s) => (
              <div key={s.l} className="text-center">
                <div className="text-title font-extrabold font-mono text-ink">{s.n ?? "–"}</div>
                <div className="text-caption text-muted mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="user-page-layout has-aside">
          <div className="user-page-main">
            {/* Tabs（设计稿 aria-tablist 语义 + 方向键；375 短标签避免竖排换行） */}
            <div
              role="tablist"
              aria-label="账户与学习设置分组"
              className="flex gap-1 overflow-x-auto border-b border-hairline"
            >
              {TABS.map((tab, index) => (
                <button
                  key={tab.key}
                  id={`profile-tab-${tab.key}`}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab.key}
                  aria-controls={`profile-panel-${tab.key}`}
                  tabIndex={activeTab === tab.key ? 0 : -1}
                  onClick={() => setActiveTab(tab.key)}
                  onKeyDown={(e) => onTabKeyDown(e, index)}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-copy font-medium transition-colors sm:px-4",
                    activeTab === tab.key
                      ? "border-brand-500 text-brand-700"
                      : "border-transparent text-muted hover:text-ink"
                  )}
                >
                  <tab.icon size={16} />
                  <span className="sm:hidden">{tab.label}</span>
                  <span className="hidden sm:inline">{tab.longLabel}</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="mt-6">
              {activeTab === "profile" && (
                <div
                  id="profile-panel-profile"
                  role="tabpanel"
                  aria-labelledby="profile-tab-profile"
                >
                  <ProfileTab user={user} onUpdate={applyUser} />
                </div>
              )}
              {activeTab === "progress" && (
                <div
                  id="profile-panel-progress"
                  role="tabpanel"
                  aria-labelledby="profile-tab-progress"
                  className="max-w-2xl space-y-6"
                >
                  {/* 学习统计（设计稿 profile「学习统计」四个数字：词库总量 / 今天到期 / 之后到期 / 已掌握） */}
                  <section>
                    <div className="user-sec-head">
                      <div>
                        <h2 className="user-sec-title">学习统计</h2>
                        <p className="user-sec-sub mt-1">查看词汇积累与复习安排。</p>
                      </div>
                    </div>
                    <div className="user-stat-grid mt-4">
                      {[
                        { n: vocabStats?.total, l: "词库总量", note: "词" },
                        { n: vocabDue, l: "今天到期", note: "词" },
                        { n: vocabLater, l: "之后到期", note: "词" },
                        { n: vocabMastered, l: "已掌握", note: "词" },
                      ].map((s) => (
                        <div key={s.l} className="user-stat">
                          <p className="user-stat-num tabular-nums">
                            {s.n ?? "–"}
                            <span className="ml-1 text-meta font-semibold text-muted">
                              {s.note}
                            </span>
                          </p>
                          <p className="user-stat-label">{s.l}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="user-sec-head">
                      <div>
                        <h2 className="user-sec-title">词库增长与掌握度（近 8 周）</h2>
                        <p className="user-sec-sub mt-1">
                          每周一快照；总词汇、已掌握与学习中的变化。
                        </p>
                      </div>
                    </div>
                    <Card padding={5} className="mt-4">
                      <MasteryTrend weeks={8} />
                    </Card>
                  </section>

                  <section>
                    <div className="user-sec-head">
                      <h2 className="user-sec-title">本周学习时长</h2>
                    </div>
                    <Card padding={5} className="mt-4">
                      {weeklyStats ? (
                        <div className="space-y-3">
                          <div className="flex items-baseline gap-2">
                            <span className="text-display font-extrabold text-ink tabular-nums">
                              {weeklyStats.this_week_minutes}
                            </span>
                            <span className="text-copy text-muted">分钟</span>
                            {weeklyStats.week_delta_pct !== null &&
                              weeklyStats.last_week_minutes > 0 && (
                                <span
                                  className={
                                    "text-meta font-semibold ml-auto " +
                                    (weeklyStats.week_delta_pct >= 0
                                      ? "text-success-text"
                                      : "text-error-text")
                                  }
                                >
                                  {weeklyStats.week_delta_pct >= 0 ? "↑" : "↓"}{" "}
                                  {Math.abs(weeklyStats.week_delta_pct)}% vs 上周
                                </span>
                              )}
                          </div>
                          {/* 柱状图：外层固定高度，柱高百分比才有基准（此前父级未定高 →
                              百分比解析为 0，只剩 2px 基线）。 */}
                          <div className="flex items-end gap-1.5">
                            {dailyMinutes.map((d, i) => {
                              const h = (d.minutes / dailyMax) * 100;
                              const labels = ["一", "二", "三", "四", "五", "六", "日"];
                              return (
                                <div
                                  key={d.date}
                                  className="flex flex-1 flex-col items-center gap-1"
                                >
                                  <div className="flex h-12 w-full items-end">
                                    <div
                                      className="w-full bg-brand-500 rounded-t-md"
                                      style={{ height: `${h}%`, minHeight: 2 }}
                                      title={d.date + " · " + d.minutes + " 分钟"}
                                    />
                                  </div>
                                  <span className="text-caption text-muted">{labels[i] ?? ""}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-meta text-muted text-center py-4">加载中…</div>
                      )}
                    </Card>
                  </section>

                  <section>
                    <div className="user-sec-head">
                      <h2 className="user-sec-title">事件占比（近 30 天）</h2>
                    </div>
                    <Card padding={5} className="mt-4">
                      <EventDistributionChart data={eventDist} />
                    </Card>
                  </section>
                </div>
              )}
              {activeTab === "account" && (
                <div
                  id="profile-panel-account"
                  role="tabpanel"
                  aria-labelledby="profile-tab-account"
                >
                  <SettingsTab
                    key="account"
                    section="account"
                    user={user}
                    preferences={preferences}
                    onUpdatePreferences={setPreferences}
                  />
                </div>
              )}
              {activeTab === "settings" && (
                <div
                  id="profile-panel-settings"
                  role="tabpanel"
                  aria-labelledby="profile-tab-settings"
                >
                  <SettingsTab
                    key="learning"
                    section="learning"
                    user={user}
                    preferences={preferences}
                    onUpdatePreferences={setPreferences}
                  />
                </div>
              )}
            </div>
          </div>

          <aside className="user-page-aside">
            <section className="user-aside-sec">
              <h2 className="user-aside-title">相关页面</h2>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/upgrade"
                    className="inline-flex items-center gap-1 text-copy font-semibold text-brand-700 hover:underline"
                  >
                    <Sparkles size={14} />
                    会员套餐
                  </Link>
                </li>
                <li>
                  <Link
                    href="/vocabulary"
                    className="inline-flex items-center gap-1 text-copy font-semibold text-brand-700 hover:underline"
                  >
                    <TrendingUp size={14} />
                    词汇与复习
                  </Link>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </PageTransition>
  );
}
