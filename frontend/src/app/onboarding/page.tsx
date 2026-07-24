"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastApiError } from "@/lib/errors";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const LEVELS = [
  { value: "A1", label: "A1 入门", description: "刚接触英语" },
  { value: "A2", label: "A2 基础", description: "能简单对话" },
  { value: "B1", label: "B1 中级", description: "日常交流无障碍" },
  { value: "B2", label: "B2 中高级", description: "能讨论复杂话题" },
  { value: "C1", label: "C1 高级", description: "接近母语水平" },
];

const EXAMS = [
  { value: "cet4", label: "大学英语四级", description: "CET-4" },
  { value: "cet6", label: "大学英语六级", description: "CET-6" },
  { value: "ielts", label: "雅思", description: "IELTS" },
  { value: "kaoyan", label: "考研英语", description: "研究生入学考试" },
  { value: "gaokao", label: "高考英语", description: "全国高考" },
  { value: "daily", label: "日常提升", description: "无特定考试，提升综合能力" },
];

const DAILY_MINUTES = [
  { value: 15, label: "15 分钟", description: "碎片时间" },
  { value: 30, label: "30 分钟", description: "推荐" },
  { value: 45, label: "45 分钟", description: "深度学习" },
  { value: 60, label: "60 分钟", description: "高强度" },
];

const TOPICS = [
  { value: "tech", label: "科技" },
  { value: "business", label: "商业" },
  { value: "education", label: "教育" },
  { value: "culture", label: "文化" },
  { value: "life", label: "生活" },
  { value: "news", label: "新闻" },
];

const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth({
    replace: true,
  });
  const { setOnboardingCompleted } = useAuthStore();

  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<string | null>(null);
  const [targetExam, setTargetExam] = useState<string | null>(null);
  const [dailyMinutes, setDailyMinutes] = useState<number>(30);
  const [topics, setTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (authLoading) return null;
  if (!isAuthenticated) return null;

  function toggleTopic(value: string) {
    setTopics((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  }

  async function handleSkip() {
    setSaving(true);
    try {
      await api("/api/v1/users/me/onboarding", {
        method: "POST",
        body: JSON.stringify({ onboarding_completed: true }),
      });
      setOnboardingCompleted();
      router.replace("/");
    } catch (err) {
      toastApiError(err, "操作失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    setSaving(true);
    try {
      await Promise.all([
        api("/api/v1/users/me", {
          method: "PATCH",
          body: JSON.stringify({ level }),
        }),
        api("/api/v1/users/me/preferences", {
          method: "PUT",
          body: JSON.stringify({
            target_exam: targetExam,
            daily_goal_type: "minutes",
            daily_goal_value: dailyMinutes,
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
      toastApiError(err, "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">
        {/* Skip button — top right */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleSkip}
            disabled={saving}
            className="text-sm text-muted hover:text-ink transition-colors disabled:opacity-50"
          >
            跳过，稍后设置
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-8 flex gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-brand-500" : "bg-hairline"
              )}
            />
          ))}
        </div>

        {/* Step 0: Level selection (merged with welcome) */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl text-ink mb-1">欢迎来到 SeeWord 👋</h2>
              <p className="text-sm text-muted-foreground">
                选择最接近你水平的级别，我们为你定制学习路线
              </p>
            </div>
            <div className="space-y-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLevel(l.value)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                    level === l.value
                      ? "border-brand-500 bg-brand-500/5 text-ink"
                      : "border-hairline text-ink hover:bg-surface-soft"
                  )}
                >
                  <span className="font-medium">{l.label}</span>
                  <span className="ml-2 text-sm text-muted-foreground">{l.description}</span>
                </button>
              ))}
            </div>
            <Button onClick={() => setStep(1)} disabled={!level} fullWidth>
              下一步
            </Button>
          </div>
        )}

        {/* Step 1: Learning goal */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl text-ink mb-1">学习目标</h2>
              <p className="text-sm text-muted-foreground">你想准备哪个考试或目标？</p>
            </div>
            <div className="space-y-2">
              {EXAMS.map((e) => (
                <button
                  key={e.value}
                  onClick={() => setTargetExam(e.value)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                    targetExam === e.value
                      ? "border-brand-500 bg-brand-500/5 text-ink"
                      : "border-hairline text-ink hover:bg-surface-soft"
                  )}
                >
                  <span className="font-medium">{e.label}</span>
                  <span className="ml-2 text-sm text-muted-foreground">{e.description}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setStep(0)} variant="secondaryDark" fullWidth>
                上一步
              </Button>
              <Button onClick={() => setStep(2)} disabled={!targetExam} fullWidth>
                下一步
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Learning rhythm */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl text-ink mb-1">学习节奏</h2>
              <p className="text-sm text-muted-foreground">设置每日学习时长和兴趣话题</p>
            </div>

            {/* Daily minutes */}
            <div>
              <p className="text-sm font-medium text-ink mb-2">每日学习时长</p>
              <div className="grid grid-cols-2 gap-2">
                {DAILY_MINUTES.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDailyMinutes(d.value)}
                    className={cn(
                      "px-4 py-3 rounded-lg border text-center transition-colors",
                      dailyMinutes === d.value
                        ? "border-brand-500 bg-brand-500/5 text-ink"
                        : "border-hairline text-ink hover:bg-surface-soft"
                    )}
                  >
                    <div className="font-medium">{d.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{d.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Interest topics */}
            <div>
              <p className="text-sm font-medium text-ink mb-2">
                兴趣话题
                <span className="ml-1 text-xs text-muted-foreground font-normal">（可多选）</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => toggleTopic(t.value)}
                    className={cn(
                      "px-3.5 py-2 rounded-full border text-sm font-medium transition-colors",
                      topics.includes(t.value)
                        ? "border-brand-500 bg-brand-500/5 text-brand-600"
                        : "border-hairline text-muted hover:bg-surface-soft hover:text-ink"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={() => setStep(1)} variant="secondaryDark" fullWidth>
                上一步
              </Button>
              <Button onClick={handleComplete} disabled={saving} fullWidth>
                {saving ? "保存中..." : "开始学习"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
