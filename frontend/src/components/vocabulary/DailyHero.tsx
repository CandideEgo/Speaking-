"use client";

import Link from "next/link";
import { Zap, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { InlineSpinner } from "@/components/common/Spinner";

/**
 * /vocabulary「今日」视图的训练 Hero（百词斩式首页）：
 * 左侧词库掌握度环（真实数据 mastered/total），右侧今日队列计数 + 大 CTA。
 * 没有待学/待复习内容时 CTA 变为完成态。
 */
export function DailyHero({
  newTotal,
  dueTotal,
  total,
  mastered,
  loading,
}: {
  newTotal: number;
  dueTotal: number;
  total: number;
  mastered: number;
  loading: boolean;
}) {
  const allDone = newTotal === 0 && dueTotal === 0;

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
          ) : (
            <p className="text-[13px] text-muted mt-1.5">
              {allDone ? (
                <>
                  <span className="inline-flex items-center gap-1 text-success font-semibold">
                    <CheckCircle2 size={14} />
                    今天的词都练完了
                  </span>
                  ，保持节奏，明天继续
                </>
              ) : (
                <>
                  待学新词 <span className="font-bold text-ink">{newTotal}</span>
                  <span className="mx-1.5 text-muted-soft">·</span>
                  待复习 <span className="font-bold text-ink">{dueTotal}</span>
                  <span className="block sm:inline text-muted-soft mt-0.5 sm:mt-0 sm:ml-2 text-xs">
                    每次约 15 新词 + 20 复习，按 SM-2 间隔推送
                  </span>
                </>
              )}
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
    </Card>
  );
}
