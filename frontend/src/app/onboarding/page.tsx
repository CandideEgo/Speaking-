"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastApiError } from "@/lib/errors";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";

const LEVELS = [
  { value: "A1", label: "A1 入门", description: "刚接触英语" },
  { value: "A2", label: "A2 基础", description: "能简单对话" },
  { value: "B1", label: "B1 中级", description: "日常交流无障碍" },
  { value: "B2", label: "B2 中高级", description: "能讨论复杂话题" },
  { value: "C1", label: "C1 高级", description: "接近母语水平" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth({
    replace: true,
  });
  const { setOnboardingCompleted } = useAuthStore();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Auth guard handled by useRequireAuth hook (redirects to /login)
  if (authLoading) return null;
  if (!isAuthenticated) return null;

  async function handleComplete() {
    setSaving(true);
    try {
      // Save level + mark onboarding completed. Goal preferences keep their
      // server defaults (the daily-goal step was removed - ADR-0003).
      await Promise.all([
        api("/api/v1/users/me", {
          method: "PATCH",
          body: JSON.stringify({ level }),
        }),
        api("/api/v1/users/me/onboarding", {
          method: "POST",
          body: JSON.stringify({ onboarding_completed: true }),
        }),
      ]);
      setOnboardingCompleted();
      router.replace("/");
    } catch (err) {
      toastApiError(err, "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">
        {/* Progress bar */}
        <div className="mb-8 flex gap-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-brand-500" : "bg-hairline"
              }`}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <span className="font-display text-4xl font-bold text-ink tracking-tight">
                SeeWord
              </span>
            </div>
            <h1 className="font-display text-3xl font-normal text-ink tracking-tight">
              欢迎来到 SeeWord
            </h1>
            <p className="text-muted-foreground">
              用真实视频学英语。让我们先了解一下你的水平。
            </p>
            <Button onClick={() => setStep(1)} fullWidth>
              开始设置
            </Button>
          </div>
        )}

        {/* Step 1: Level selection */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl text-ink mb-1">
                你的英语水平
              </h2>
              <p className="text-sm text-muted-foreground">选择最接近的级别</p>
            </div>
            <div className="space-y-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLevel(l.value)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    level === l.value
                      ? "border-brand-500 bg-brand-500/5 text-ink"
                      : "border-hairline text-ink hover:bg-cream-soft"
                  }`}
                >
                  <span className="font-medium">{l.label}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {l.description}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => setStep(0)}
                variant="secondaryDark"
                fullWidth
              >
                上一步
              </Button>
              <Button
                onClick={handleComplete}
                disabled={!level || saving}
                fullWidth
              >
                {saving ? "保存中..." : "开始学习"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
