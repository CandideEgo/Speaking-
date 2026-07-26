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
import { cn } from "@/lib/utils";
import type { User, UserPreferences, Milestone } from "@/types";

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
  const [loading, setLoading] = useState(true);

  // Fetch user + preferences once auth is initialized
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    let cancelled = false;
    setLoading(true);

    async function loadData() {
      try {
        const [u, p, m] = await Promise.allSettled([
          api<User>("/api/v1/users/me"),
          api<UserPreferences>("/api/v1/users/me/preferences"),
          api<Milestone[]>("/api/v1/plan/milestones"),
        ]);
        if (cancelled) return;
        if (u.status === "fulfilled") setUser(u.value);
        else router.push("/login");
        if (p.status === "fulfilled") setPreferences(p.value);
        if (m.status === "fulfilled") setMilestones(m.value);
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
