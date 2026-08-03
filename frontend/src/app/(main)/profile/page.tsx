"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/common/ErrorState";
import { PageTransition } from "@/components/common/PageTransition";
import { User as UserIcon, Settings, BookOpen, TrendingUp } from "lucide-react";
import ProfileTab from "@/components/profile/ProfileTab";
import SettingsTab from "@/components/profile/SettingsTab";
import LearningPrefsTab from "@/components/profile/LearningPrefsTab";
import { MasteryTrend } from "@/components/profile/MasteryTrend";
import { MilestoneGrid } from "@/components/profile/MilestoneBadge";
import { isProUser } from "@/lib/api";
import { EXAM_LEVELS } from "@/lib/examLevels";
import { cn } from "@/lib/utils";
import type { User, UserPreferences, Milestone, Paginated, LearningRecord } from "@/types";

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

const TABS = [
  { key: "profile", label: "个人资料", icon: UserIcon },
  { key: "progress", label: "学习进度", icon: TrendingUp },
  { key: "settings", label: "账户设置", icon: Settings },
  { key: "learning", label: "学习偏好", icon: BookOpen },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [vocabStats, setVocabStats] = useState<VocabStats | null>(null);
  const [recordsTotal, setRecordsTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user + preferences once auth is initialized
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    let cancelled = false;
    setLoading(true);

    async function loadData() {
      try {
        const [u, p, m, vs, rec] = await Promise.allSettled([
          api<User>("/api/v1/users/me"),
          api<UserPreferences>("/api/v1/users/me/preferences"),
          api<Milestone[]>("/api/v1/plan/milestones"),
          api<VocabStats>("/api/v1/vocabulary/stats"),
          api<Paginated<LearningRecord>>("/api/v1/learning/records?page=1&page_size=1"),
        ]);
        if (cancelled) return;
        if (u.status === "fulfilled") setUser(u.value);
        else router.push("/login");
        if (p.status === "fulfilled") setPreferences(p.value);
        if (m.status === "fulfilled") setMilestones(m.value);
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
            // eslint-disable-next-line @next/next/no-img-element
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
              {isProUser(user) && (
                <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-pill bg-brand-50 text-brand-600">
                  Pro 会员
                </span>
              )}
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
              { n: user.streak_count, l: "连续天数" },
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
          <div className="max-w-2xl space-y-8">
            <div>
              <h2 className="text-sm font-medium text-ink mb-4">掌握度趋势</h2>
              <MasteryTrend weeks={8} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-ink mb-4">成就徽章</h2>
              <MilestoneGrid milestones={milestones} />
            </div>
          </div>
        )}
        {activeTab === "settings" && <SettingsTab user={user} />}
        {activeTab === "learning" && (
          <LearningPrefsTab preferences={preferences} onUpdate={setPreferences} />
        )}
      </main>
    </PageTransition>
  );
}
