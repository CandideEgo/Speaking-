"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toastApiError } from "@/lib/errors";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Button } from "@/components/ui/Button";
import { InterestPicker } from "@/components/profile/InterestPicker";
import { AuthCard } from "@/components/auth/AuthCard";
import { Modal } from "@/components/common/Modal";
import { cn } from "@/lib/utils";
import { cefrExamHint } from "@/lib/cefrLevels";

const LEVELS = [
  { value: "A1", label: "A1 入门", description: "刚接触英语" },
  { value: "A2", label: "A2 基础", description: "能简单对话" },
  { value: "B1", label: "B1 中级", description: "日常交流无障碍" },
  { value: "B2", label: "B2 中高级", description: "能讨论复杂话题" },
  { value: "C1", label: "C1 高级", description: "接近母语水平" },
];

const EXAMS = [
  // value 必须是后端 canonical 考试键（app/core/exam_levels.py），
  // 否则 preferences PUT 会被 422 拒。与 watch 页高亮选择器同一套键。
  { value: "gaoKao", label: "高考英语", description: "全国高考" },
  { value: "cet4", label: "大学英语四级", description: "CET-4" },
  { value: "cet6", label: "大学英语六级", description: "CET-6" },
  { value: "ky", label: "考研英语", description: "研究生入学考试" },
  { value: "ielts", label: "雅思", description: "IELTS" },
  // "daily" 无对应考试级别：保存时传 null，不高亮任何考试词。
  { value: "daily", label: "日常提升", description: "无特定考试，提升综合能力" },
];

const DAILY_MINUTES = [
  { value: 15, label: "15 分钟", description: "碎片时间" },
  { value: 30, label: "30 分钟", description: "推荐" },
  { value: 45, label: "45 分钟", description: "深度学习" },
  { value: 60, label: "60 分钟", description: "高强度" },
];

const TOTAL_STEPS = 3;

/** 引导页的“选项卡片”（设计 `.opt`：桌面 2 列 / 手机 1 列，选中浅橙底 + 描边）。 */
function PickOption({
  selected,
  label,
  description,
  onClick,
}: {
  selected: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 rounded-md border px-4 py-3 text-left transition-colors",
        selected
          ? "border-brand-500 bg-brand-50 text-ink"
          : "border-hairline text-ink hover:bg-surface-soft"
      )}
    >
      <span className="text-copy font-semibold">{label}</span>
      <span className={cn("text-meta", selected ? "text-body" : "text-muted")}>{description}</span>
    </button>
  );
}

function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-hairline-soft py-4 first:border-t-0">
      <div>
        <p className="text-copy font-semibold text-ink">{title}</p>
        <p className="mt-1 text-caption text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 flex-none rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "bg-brand-500" : "bg-hairline"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-canvas shadow-sm transition-transform",
            checked && "translate-x-5"
          )}
        />
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth({
    replace: true,
  });

  const [interests, setInterests] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<string | null>(null);
  const [targetExam, setTargetExam] = useState<string | null>(null);
  const [dailyMinutes, setDailyMinutes] = useState<number>(30);
  // 设计第 3 步的两个提醒开关：每日学习提醒默认关闭、连续学习提醒默认开启。
  const [dailyReminder, setDailyReminder] = useState(false);
  const [streakReminder, setStreakReminder] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  // 换步时回到页面顶部：第 3 步比第 1 步长得多，否则用户会落在半屏中间。
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  if (authLoading) return null;
  if (!isAuthenticated) return null;

  async function handleSkip() {
    setSaving(true);
    try {
      await api("/api/v1/users/me/onboarding", {
        method: "POST",
        body: JSON.stringify({ onboarding_completed: true }),
      });
      router.replace("/");
    } catch (err) {
      toastApiError(err, "操作失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function saveReminderPreferences() {
    try {
      await api("/api/v1/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({ streak_reminder: streakReminder }),
      });
    } catch (err) {
      // 提醒偏好失败不阻塞引导完成，但必须让用户知道（可在通知页重设）。
      toastApiError(err, "提醒设置保存失败，可在「通知」页重设");
    }
  }

  async function handleComplete() {
    setSaving(true);
    try {
      await api("/api/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify({ level }),
      });
      await api("/api/v1/users/me/preferences", {
        method: "PUT",
        body: JSON.stringify({
          // "daily" 无 canonical 考试键 → 清空目标（后端校验只收 exam_levels 键）。
          interest_categories: interests,
          target_exam: targetExam === "daily" ? null : targetExam,
          daily_goal_type: "minutes",
          daily_goal_value: dailyMinutes,
          reminder_enabled: dailyReminder,
        }),
      });
      await saveReminderPreferences();
      // 串行且引导标记最后写：前面失败时不置位，用户重试即可全部补齐；
      // 若并行，标记可能先落地而资料未保存，用户会直接跳过引导。
      await api("/api/v1/users/me/onboarding", {
        method: "POST",
        body: JSON.stringify({ onboarding_completed: true }),
      });
      // 第一课：有 is_demo 视频就直达 demo watch；没有则不阻塞，回首页。
      try {
        const demo = await api<{ id: string }>("/api/v1/videos/demo");
        router.replace(`/watch/${demo.id}?first_lesson=1`);
      } catch {
        track("demo_video_missing");
        router.replace("/");
      }
    } catch (err) {
      toastApiError(err, "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthCard
      wide
      title="第一次进入：三步设好学习起点"
      subtitle="三步都能跳过，之后在「我的 → 学习设置」里改。选择只影响默认难度、考试词高亮和每日目标，不影响能看什么内容。"
      headerActions={
        <button
          type="button"
          onClick={() => setShowSkipConfirm(true)}
          disabled={saving}
          className="text-copy text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-muted"
        >
          跳过设置
        </button>
      }
    >
      <div className="mt-5 flex items-start gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2.5 text-meta leading-relaxed text-body">
        <span aria-hidden="true">✨</span>
        <span>
          <strong className="font-semibold text-ink">跳过会怎样：</strong>
          没有目标考试时，视频里的四级/六级重点词不会高亮；每日目标默认按 30
          分钟。其余功能都能正常用。
        </span>
      </div>

      <div
        className="mt-6 flex gap-2"
        role="img"
        aria-label={`引导进度：共 3 步，当前第 ${step + 1} 步`}
      >
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index <= step ? "bg-brand-500" : "bg-surface-card"
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-meta text-muted">第 {step + 1} 步 / 共 3 步</p>

      {/* 第 1 步：当前水平 */}
      {step === 0 && (
        <div className="mt-6 space-y-6">
          <div>
            <h2 className="text-title font-semibold text-ink">欢迎来到 SeeWord 👋</h2>
            <p className="mt-1 text-copy text-muted">
              选择最接近你水平的级别，我们为你定制学习路线。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {LEVELS.map((item) => (
              <PickOption
                key={item.value}
                selected={level === item.value}
                label={item.label}
                description={`${item.description}${cefrExamHint(item.value) ? ` · ≈${cefrExamHint(item.value)}` : ""}`}
                onClick={() => setLevel(item.value)}
              />
            ))}
          </div>
          <Button
            onClick={() => setStep(1)}
            disabled={!level}
            fullWidth
            className="disabled:text-body!"
          >
            下一步
          </Button>
        </div>
      )}

      {/* 第 2 步：学习目标 */}
      {step === 1 && (
        <div className="mt-6 space-y-6">
          <div>
            <h2 className="text-title font-semibold text-ink">学习目标</h2>
            <p className="mt-1 text-copy text-muted">你想准备哪个考试或目标？</p>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {EXAMS.map((item) => (
              <PickOption
                key={item.value}
                selected={targetExam === item.value}
                label={item.label}
                description={item.description}
                onClick={() => setTargetExam(item.value)}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setStep(0)} variant="outline" fullWidth>
              上一步
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!targetExam}
              fullWidth
              className="disabled:text-body!"
            >
              下一步
            </Button>
          </div>
        </div>
      )}

      {/* 第 3 步：兴趣 + 每日目标与提醒 */}
      {step === 2 && (
        <div className="mt-6 space-y-7">
          <InterestPicker value={interests} onChange={setInterests} disabled={saving} />
          {interests.length > 0 && (
            <p className="text-meta text-muted">已选 {interests.length} 个兴趣</p>
          )}

          <div className="space-y-4">
            <div>
              <h2 className="text-title font-semibold text-ink">学习节奏</h2>
              <p className="mt-1 text-copy text-muted">
                每日目标是「今天到期多少」的计算口径，不做打卡惩罚。
              </p>
            </div>
            <div>
              <p className="mb-2 text-copy font-medium text-ink">每日学习时长</p>
              <div className="grid grid-cols-2 gap-2">
                {DAILY_MINUTES.map((item) => (
                  <PickOption
                    key={item.value}
                    selected={dailyMinutes === item.value}
                    label={item.label}
                    description={item.description}
                    onClick={() => setDailyMinutes(item.value)}
                  />
                ))}
              </div>
            </div>

            <div>
              <SwitchRow
                title="每日学习提醒"
                description="到点在站内通知里提醒今天到期的词，不推送营销内容。"
                checked={dailyReminder}
                onChange={setDailyReminder}
                disabled={saving}
              />
              <SwitchRow
                title="连续学习提醒"
                description="连续记录即将中断时提醒一次；不催、不惩罚。"
                checked={streakReminder}
                onChange={setStreakReminder}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => setStep(1)} variant="outline" fullWidth disabled={saving}>
              上一步
            </Button>
            <Button
              onClick={handleComplete}
              disabled={saving}
              fullWidth
              className="disabled:text-body!"
            >
              {saving ? "保存中..." : "开始学习"}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={showSkipConfirm}
        onClose={() => setShowSkipConfirm(false)}
        title="跳过会关闭考试词高亮"
        closeOnBackdrop={!saving}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowSkipConfirm(false)} disabled={saving}>
              去设置目标
            </Button>
            <Button
              variant="dark"
              disabled={saving}
              onClick={() => {
                setShowSkipConfirm(false);
                void handleSkip();
              }}
            >
              仍然跳过
            </Button>
          </>
        }
      >
        <p className="text-copy leading-relaxed text-muted">
          没有目标考试时，视频里的四级/六级重点词不会高亮。你仍然可以稍后在「我的 →
          学习设置」里补上。
        </p>
      </Modal>
    </AuthCard>
  );
}
