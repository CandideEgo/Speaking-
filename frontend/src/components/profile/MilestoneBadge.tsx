"use client";

import {
  BookOpen,
  Trophy,
  Library,
  Flame,
  CalendarCheck,
  PlayCircle,
  Mic,
  RefreshCw,
  Lock,
} from "lucide-react";
import type { Milestone } from "@/types";

/** Milestone type → display config */
const MILESTONE_CONFIG: Record<
  string,
  { icon: typeof BookOpen; label: string; description: string }
> = {
  vocab_50: {
    icon: BookOpen,
    label: "初识半百",
    description: "累计学习 50 个单词",
  },
  mastered_100_words: {
    icon: Trophy,
    label: "百词斩",
    description: "掌握 100 个单词",
  },
  vocab_200: {
    icon: Library,
    label: "词汇达人",
    description: "累计学习 200 个单词",
  },
  streak_7_days: {
    icon: Flame,
    label: "七日不辍",
    description: "连续学习 7 天",
  },
  streak_30_days: {
    icon: CalendarCheck,
    label: "月度坚持",
    description: "连续学习 30 天",
  },
  completed_10_videos: {
    icon: PlayCircle,
    label: "观影十部",
    description: "完成观看 10 个视频",
  },
  first_shadowing: {
    icon: Mic,
    label: "初次跟读",
    description: "完成第一次跟读练习",
  },
  first_review: {
    icon: RefreshCw,
    label: "温故知新",
    description: "完成第一次词汇复习",
  },
};

/** All milestone types in display order */
export const ALL_MILESTONE_TYPES = [
  "first_review",
  "first_shadowing",
  "vocab_50",
  "streak_7_days",
  "mastered_100_words",
  "completed_10_videos",
  "vocab_200",
  "streak_30_days",
];

interface MilestoneBadgeProps {
  type: string;
  milestone?: Milestone;
}

/** Single milestone badge card */
export function MilestoneBadge({ type, milestone }: MilestoneBadgeProps) {
  const config = MILESTONE_CONFIG[type];
  if (!config) return null;

  const achieved = !!milestone;
  const Icon = achieved ? config.icon : Lock;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        achieved ? "border-coral/20 bg-coral/5" : "border-hairline bg-surface-card opacity-60"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          achieved ? "bg-coral/10 text-coral" : "bg-surface-card text-muted-foreground"
        }`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            achieved ? "text-ink" : "text-muted-foreground"
          }`}
        >
          {config.label}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {achieved && milestone?.achieved_at
            ? new Date(milestone.achieved_at).toLocaleDateString("zh-CN")
            : config.description}
        </p>
      </div>
    </div>
  );
}

interface MilestoneGridProps {
  milestones: Milestone[];
}

/** Grid of all milestone badges (achieved + locked) */
export function MilestoneGrid({ milestones }: MilestoneGridProps) {
  const achievedMap = new Map(milestones.map((m) => [m.milestone_type, m]));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {ALL_MILESTONE_TYPES.map((type) => (
        <MilestoneBadge key={type} type={type} milestone={achievedMap.get(type)} />
      ))}
    </div>
  );
}

/** Get the display label for a milestone type (used in banners/toasts) */
export function getMilestoneLabel(type: string): string {
  return MILESTONE_CONFIG[type]?.label ?? type;
}
