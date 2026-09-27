"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BookOpen, CheckCircle2, Zap } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { InlineSpinner } from "@/components/common/Spinner";
import { api } from "@/lib/api";
import type { TodayTrainingSummary, VocabularyPreferences } from "@/types";

/** 每日新词配额预设（DEC-053）：全局一个设置，不是每个视频一份。 */
const QUOTA_PRESETS = [10, 20, 30, 50];

/**
 * /vocabulary「今日」视图 —— 整页唯一一张行动卡。
 *
 * 上半是「今天要做什么」：词库掌握环 + 待学/待复习 + 开始训练 CTA；
 * 下半（细分隔线内）是「今天已经做了什么」+ 每日新词配额设置。
 * 配额是偏好设置而不是主操作，所以用 brand 软底的选中态 chip（与 `Badge` 同款
 * 配色），不用主按钮那种 `bg-ink` 实心块去和 CTA 抢视觉。
 *
 * 词库一个词都没有时（`total === 0`）整卡换成首启引导：此时「开始今日训练」
 * 必然空转进总结页，主操作只能是去频道收词。
 */
export function DailyHero({
  newTotal,
  dueTotal,
  total,
  mastered,
  loading,
  today,
  preferences,
  onQuotaSaved,
}: {
  newTotal: number;
  dueTotal: number;
  total: number;
  mastered: number;
  loading: boolean;
  today: TodayTrainingSummary;
  preferences: VocabularyPreferences | null;
  /** PUT /vocabulary/preferences 成功后回传，调用方就地生效不重拉队列。 */
  onQuotaSaved: (next: VocabularyPreferences) => void;
}) {
  const [custom, setCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [saving, setSaving] = useState(false);

  const newTarget = preferences?.daily_new_target ?? 10;
  const reviewTarget = preferences?.daily_review_target ?? 20;
  const min = preferences?.quota_min ?? 5;
  const max = preferences?.quota_max ?? 100;
  const allDone = total > 0 && newTotal === 0 && dueTotal === 0;

  async function saveQuota(value: number) {
    if (saving) return;
    setSaving(true);
    try {
      const next = await api<VocabularyPreferences>("/api/v1/vocabulary/preferences", {
        method: "PUT",
        body: JSON.stringify({ daily_new_target: value }),
      });
      onQuotaSaved(next);
      setCustom(false);
      toast.success(`每日新词配额已设为 ${next.daily_new_target}`);
    } catch {
      toast.error("配额保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  const chipClass = (active: boolean) =>
    [
      "px-2.5 py-1 rounded-sm text-xs font-semibold border transition-colors duration-150 disabled:opacity-50",
      active
        ? "bg-brand-50 text-brand-600 border-brand-100"
        : "bg-canvas text-muted border-hairline hover:border-ink hover:text-ink",
    ].join(" ");

  // 首启：一个词都没有 —— 训练入口无处可去，主操作换成收词。
  if (!loading && total === 0) {
    return (
      <Card variant="outline" padding={6} className="mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
          <span className="w-14 h-14 rounded-full bg-brand-50 text-brand-500 flex items-center justify-center flex-shrink-0">
            <BookOpen size={26} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-extrabold tracking-tight text-ink">词库还是空的</h2>
            <p className="text-[13px] text-muted mt-1.5">
              去频道看视频，点字幕里的生词加入词库，这里就会出现今日训练。
            </p>
          </div>
          <Link
            href="/browse"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-brand-500 text-on-primary text-sm font-semibold shadow-brand hover:bg-brand-600 hover:-translate-y-0.5 transition-all flex-shrink-0"
          >
            去频道看视频
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="outline" padding={6} className="mb-6">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <ProgressRing
            size={92}
            strokeWidth={6}
            progress={total > 0 ? mastered / total : 0}
            isMet={total > 0 && mastered >= total}
            label={`${mastered}/${total}`}
          />
          <span className="text-[11px] text-muted">词库掌握</span>
        </div>

        <div className="flex-1 text-center sm:text-left min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-ink">今日训练</h2>
          {loading ? (
            <div className="mt-2 flex justify-center sm:justify-start">
              <InlineSpinner />
            </div>
          ) : allDone ? (
            <p className="text-[13px] text-muted mt-1.5">
              <span className="inline-flex items-center gap-1 text-success font-semibold">
                <CheckCircle2 size={14} />
                今天的词都练完了
              </span>
              ，保持节奏，明天继续
            </p>
          ) : (
            <p className="text-[13px] text-muted mt-1.5">
              待学新词 <span className="font-bold text-ink">{newTotal}</span>
              <span className="mx-1.5 text-muted-soft">·</span>
              待复习 <span className="font-bold text-ink">{dueTotal}</span>
              <span className="block text-xs text-muted-soft mt-1">
                每日 {newTarget} 新词 + {reviewTarget} 复习，按错误次数安排复习
              </span>
            </p>
          )}
        </div>

        {allDone && !loading ? (
          <span className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-surface-card text-muted text-sm font-semibold flex-shrink-0">
            <CheckCircle2 size={16} />
            今日已完成
          </span>
        ) : (
          <Link
            href="/vocabulary/drill"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-brand-500 text-on-primary text-sm font-semibold shadow-brand hover:bg-brand-600 hover:-translate-y-0.5 transition-all flex-shrink-0"
          >
            <Zap size={16} />
            开始今日训练
          </Link>
        )}
      </div>

      {!loading && (
        <div className="mt-5 pt-4 border-t border-hairline-soft flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted">
            今日已学 <span className="font-bold text-ink">{today.words_learned}</span> 词（含加练）
            {today.rounds > 0 && (
              <>
                <span className="mx-1.5 text-muted-soft">·</span>第{" "}
                <span className="font-bold text-ink">{today.rounds}</span> 轮
              </>
            )}
          </p>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted mr-0.5">每日新词</span>
            {QUOTA_PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                disabled={saving}
                onClick={() => saveQuota(value)}
                aria-pressed={value === newTarget}
                className={chipClass(value === newTarget)}
              >
                {value}
              </button>
            ))}
            {custom ? (
              <span className="inline-flex items-center gap-1.5">
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  aria-label="自定义每日新词配额"
                  className="w-20 h-7 px-2.5 rounded-sm bg-surface-card border border-transparent text-xs text-ink
                    focus:bg-canvas focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand-500/20
                    transition-colors duration-150"
                />
                <Button
                  size="sm"
                  variant="dark"
                  disabled={saving}
                  onClick={() => {
                    const value = Math.round(Number(customValue));
                    if (!Number.isFinite(value) || value < min || value > max) {
                      toast.error(`请输入 ${min}~${max} 之间的数字`);
                      return;
                    }
                    saveQuota(value);
                  }}
                >
                  确定
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCustom(false)}>
                  取消
                </Button>
              </span>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setCustomValue(String(newTarget));
                  setCustom(true);
                }}
                className={chipClass(!QUOTA_PRESETS.includes(newTarget))}
              >
                自定义
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
