"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import {
  UserIcon,
  SettingsIcon,
  BookOpenIcon,
} from "@/components/common/Icons";
import ProfileTab from "@/components/profile/ProfileTab";
import SettingsTab from "@/components/profile/SettingsTab";
import LearningPrefsTab from "@/components/profile/LearningPrefsTab";
import type { User, UserPreferences } from "@/types";

const TABS = [
  { key: "profile", label: "个人资料", icon: UserIcon },
  { key: "settings", label: "账户设置", icon: SettingsIcon },
  { key: "learning", label: "学习偏好", icon: BookOpenIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ProfilePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user + preferences once auth is initialized
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function loadData() {
      try {
        const [u, p] = await Promise.allSettled([
          api<User>("/api/v1/users/me"),
          api<UserPreferences>("/api/v1/users/me/preferences"),
        ]);
        if (cancelled) return;
        if (u.status === "fulfilled") setUser(u.value);
        else router.push("/login");
        if (p.status === "fulfilled") setPreferences(p.value);
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">加载账户信息失败</p>
          <Button onClick={() => window.location.reload()}>重试</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-canvas">
      {/* Header */}
      <section className="border-b border-hairline bg-canvas">
        <div className="container-page py-8 sm:py-12">
          <div className="flex items-center gap-2 text-coral mb-3">
            <UserIcon className="h-[18px] w-[18px]" />
            <span className="text-xs font-semibold tracking-caption-wide uppercase">
              个人设置
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-normal text-ink tracking-display-xl leading-tight">
            账户管理
          </h1>
        </div>
      </section>

      {/* Tabs */}
      <section className="container-page py-6">
        <div className="flex gap-1 border-b border-hairline mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-coral text-coral"
                  : "border-transparent text-muted-foreground hover:text-ink"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "profile" && (
          <ProfileTab user={user} onUpdate={setUser} />
        )}
        {activeTab === "settings" && <SettingsTab user={user} />}
        {activeTab === "learning" && (
          <LearningPrefsTab
            preferences={preferences}
            onUpdate={setPreferences}
          />
        )}
      </section>
    </main>
  );
}
