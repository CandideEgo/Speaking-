"use client";

import {
  MicIcon,
  TargetIcon,
  WindIcon,
  CheckCircleIcon,
  BookOpenIcon,
  PlayIcon,
} from "@/components/common/Icons";
import type { UserStats } from "@/types";

interface StatsGridProps {
  stats: UserStats | null;
}

const STAT_CARDS: {
  key: keyof UserStats;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  suffix?: string;
}[] = [
  {
    key: "total_speaking_attempts",
    label: "跟读次数",
    icon: MicIcon,
    color: "text-coral",
    bg: "bg-coral/10",
  },
  {
    key: "average_accuracy",
    label: "准确度",
    icon: TargetIcon,
    color: "text-coral",
    bg: "bg-coral/10",
    suffix: "%",
  },
  {
    key: "average_fluency",
    label: "流利度",
    icon: WindIcon,
    color: "text-teal",
    bg: "bg-teal/10",
    suffix: "%",
  },
  {
    key: "average_completeness",
    label: "完整度",
    icon: CheckCircleIcon,
    color: "text-amber-600",
    bg: "bg-amber-50",
    suffix: "%",
  },
  {
    key: "total_vocabulary",
    label: "词汇量",
    icon: BookOpenIcon,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    key: "total_videos_watched",
    label: "视频数",
    icon: PlayIcon,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
];

export default function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {STAT_CARDS.map((card) => {
        const rawValue = stats ? stats[card.key] : 0;
        const value = typeof rawValue === "number" ? Math.round(rawValue) : 0;

        return (
          <div key={card.key} className="card-outline !p-4 flex flex-col items-center text-center">
            <div className={`h-9 w-9 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
              <card.icon className={`h-4.5 w-4.5 ${card.color}`} />
            </div>
            <span className="font-display text-2xl text-ink">
              {value}
              {card.suffix || ""}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">{card.label}</span>
          </div>
        );
      })}
    </div>
  );
}
