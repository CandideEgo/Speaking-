"use client";

import { levelMeta } from "@/lib/examLevels";
import type { LearningProfile } from "@/types";

interface MasteryBreakdownProps {
  profile: LearningProfile | null;
}

const MASTERY_COLORS: Record<string, string> = {
  mastered: "bg-success",
  reviewing: "bg-brand-500",
  learning: "bg-warning",
  new: "bg-hairline",
};

const MASTERY_LABELS: Record<string, string> = {
  mastered: "已掌握",
  reviewing: "复习中",
  learning: "学习中",
  new: "新词",
};

/**
 * Per-exam-level mastery breakdown bar chart.
 * Shows stacked horizontal bars for each exam level.
 */
export function MasteryBreakdown({ profile }: MasteryBreakdownProps) {
  const masteryByLevel = profile?.mastery_by_level;

  if (!masteryByLevel || Object.keys(masteryByLevel).length === 0) {
    return <div className="text-sm text-muted py-4">暂无词汇掌握数据，开始学习后将显示统计</div>;
  }

  // Sort levels by exam difficulty
  const sortedLevels = Object.keys(masteryByLevel).sort((a, b) => {
    const aMeta = levelMeta(a);
    const bMeta = levelMeta(b);
    return (aMeta?.order ?? 0) - (bMeta?.order ?? 0);
  });

  return (
    <div className="space-y-3">
      {sortedLevels.map((levelKey) => {
        const stats = masteryByLevel[levelKey];
        const meta = levelMeta(levelKey);
        const label = meta?.label ?? levelKey;
        const total = stats.total ?? 1;

        return (
          <div key={levelKey}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-ink">{label}</span>
              <span className="text-xs text-muted">
                {stats.mastered ?? 0}/{total} 已掌握
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-surface-soft">
              {["mastered", "reviewing", "learning", "new"].map((mastery) => {
                const count = stats[mastery] ?? 0;
                if (count === 0) return null;
                const pct = (count / total) * 100;
                return (
                  <div
                    key={mastery}
                    className={MASTERY_COLORS[mastery]}
                    style={{ width: `${pct}%` }}
                    title={`${MASTERY_LABELS[mastery]}: ${count}`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex gap-4 mt-4 pt-3 border-t border-hairline">
        {Object.entries(MASTERY_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5 text-[11px] text-muted">
            <div className={`w-2.5 h-2.5 rounded-sm ${MASTERY_COLORS[key]}`} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
