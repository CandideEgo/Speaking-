"use client";

import type { LucideIcon } from "lucide-react";
import { Mic, Target, Wind, CheckCircle, BookOpen, Play } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { UserStats } from "@/types";

interface StatsGridProps {
  stats: UserStats | null;
}

const STAT_CARDS: {
  key: keyof UserStats;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  suffix?: string;
}[] = [
  {
    key: "total_speaking_attempts",
    label: "跟读次数",
    icon: Mic,
    color: "text-coral",
    bg: "bg-coral/10",
  },
  {
    key: "average_accuracy",
    label: "准确度",
    icon: Target,
    color: "text-coral",
    bg: "bg-coral/10",
    suffix: "%",
  },
  {
    key: "average_fluency",
    label: "流利度",
    icon: Wind,
    color: "text-teal",
    bg: "bg-teal/10",
    suffix: "%",
  },
  {
    key: "average_completeness",
    label: "完整度",
    icon: CheckCircle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    suffix: "%",
  },
  {
    key: "total_vocabulary",
    label: "词汇量",
    icon: BookOpen,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    key: "total_videos_watched",
    label: "视频数",
    icon: Play,
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
          <Card
            key={card.key}
            padding={4}
            className="flex flex-col items-center text-center"
          >
            <div
              className={`h-9 w-9 rounded-lg ${card.bg} flex items-center justify-center mb-2`}
            >
              <card.icon size={18} className={card.color} />
            </div>
            <span className="font-display text-2xl text-ink">
              {value}
              {card.suffix || ""}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">
              {card.label}
            </span>
          </Card>
        );
      })}
    </div>
  );
}
