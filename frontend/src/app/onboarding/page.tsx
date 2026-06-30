"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

const LEVELS = [
  { value: "A1", label: "A1 入门", description: "刚接触英语" },
  { value: "A2", label: "A2 基础", description: "能简单对话" },
  { value: "B1", label: "B1 中级", description: "日常交流无障碍" },
  { value: "B2", label: "B2 中高级", description: "能讨论复杂话题" },
  { value: "C1", label: "C1 高级", description: "接近母语水平" },
];

const GOALS = [
  {
    value: "speaking_attempts",
    label: "每天开口说",
    description: "每日练习次数",
    target: 5,
  },
  {
    value: "minutes",
    label: "每天学 X 分钟",
    description: "累计学习时长",
    target: 15,
  },
  {
    value: "words",
    label: "每天记 X 个词",
    description: "新增词汇量",
    target: 10,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { setOnboardingCompleted } = useAuthStore();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<string>("speaking_attempts");
  const [goalValue, setGoalValue] = useState(5);
  const [saving, setSaving] = useState(false);

  async function handleComplete() {
    setSaving(true);
    try {
      // Save level, goal preferences, and mark onboarding completed.
      // Use Promise.all (not allSettled) so any failure is caught —
      // otherwise the user gets stuck in a redirect loop if the server
      // POST fails while localStorage is set.
      await Promise.all([
        api("/api/v1/users/me", {
          method: "PATCH",
          body: JSON.stringify({ level }),
        }),
        api("/api/v1/users/me/preferences", {
          method: "PUT",
          body: JSON.stringify({
            daily_goal_type: goalType,
            daily_goal_value: goalValue,
          }),
        }),
        api("/api/v1/users/me/onboarding", {
          method: "POST",
          body: JSON.stringify({ onboarding_completed: true }),
        }),
      ]);
      setOnboardingCompleted();
      router.replace("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">
        {/* Progress bar */}
        <div className="mb-8 flex gap-2">
          {[0, 1, 2].map((i) => (
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
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-white text-2xl font-bold">
                S
              </span>
            </div>
            <h1 className="font-display text-3xl font-normal text-ink tracking-tight">
              欢迎来到 Speaking
            </h1>
            <p className="text-muted-foreground">
              用真实视频学开口说英语。让我们先了解一下你的水平。
            </p>
            <button onClick={() => setStep(1)} className="btn-primary w-full">
              开始设置
            </button>
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
              <button
                onClick={() => setStep(0)}
                className="btn-secondary-dark flex-1"
              >
                上一步
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!level}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Goal setting */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl text-ink mb-1">
                每日学习目标
              </h2>
              <p className="text-sm text-muted-foreground">
                养成每天练习的习惯
              </p>
            </div>
            <div className="space-y-2">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => {
                    setGoalType(g.value);
                    setGoalValue(g.target);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    goalType === g.value
                      ? "border-brand-500 bg-brand-500/5 text-ink"
                      : "border-hairline text-ink hover:bg-cream-soft"
                  }`}
                >
                  <span className="font-medium">{g.label}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {g.description}
                  </span>
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                目标值: {goalValue}
              </label>
              <input
                type="range"
                min={1}
                max={30}
                value={goalValue}
                onChange={(e) => setGoalValue(parseInt(e.target.value))}
                className="w-full accent-coral"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="btn-secondary-dark flex-1"
              >
                上一步
              </button>
              <button
                onClick={handleComplete}
                disabled={saving}
                className="btn-primary flex-1"
              >
                {saving ? "保存中..." : "开始学习"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
