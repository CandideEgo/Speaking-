"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Play, BookOpen, Dumbbell, ArrowRight, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LearningPlanItem } from "@/types";

interface PlanItemCardProps {
  item: LearningPlanItem;
  onComplete: (itemId: string) => void;
}

const ITEM_TYPE_CONFIG: Record<
  string,
  { icon: typeof Play; label: string; color: string; action: string }
> = {
  review_words: {
    icon: BookOpen,
    label: "复习单词",
    color: "text-brand-500 bg-brand-50",
    action: "开始复习",
  },
  watch_video: {
    icon: Play,
    label: "观看视频",
    color: "text-sky-600 bg-sky-soft",
    action: "继续观看",
  },
  practice: {
    icon: Dumbbell,
    label: "练习",
    color: "text-purple-600 bg-indigo-soft",
    action: "开始练习",
  },
  vocab_drill: {
    icon: BookOpen,
    label: "词汇练习",
    color: "text-teal-600 bg-teal/10",
    action: "开始练习",
  },
  shadowing: {
    icon: Mic,
    label: "跟读练习",
    color: "text-orange-600 bg-orange-50",
    action: "去跟读",
  },
};

export function PlanItemCard({ item, onComplete }: PlanItemCardProps) {
  const config = ITEM_TYPE_CONFIG[item.item_type] ?? ITEM_TYPE_CONFIG.review_words;
  const Icon = config.icon;
  const itemConfig = item.item_config ?? {};

  // Transient "completing" state: plays check-pop + flash animation before
  // the store re-fetches and flips item.completed to true.
  const [completing, setCompleting] = useState(false);

  function handleComplete() {
    if (completing) return;
    setCompleting(true);
    onComplete(item.id);
  }

  // Build description text
  let description = "";
  if (item.item_type === "review_words") {
    description = `复习 ${itemConfig.count ?? 0} 个待复习单词`;
  } else if (item.item_type === "watch_video") {
    const title = (itemConfig.title as string) ?? "视频";
    const progress = (itemConfig.progress as number) ?? 0;
    description = progress > 0 ? `${title}（${Math.round(progress * 100)}% 已完成）` : title;
  } else if (item.item_type === "practice") {
    description = `练习 ${itemConfig.item_count ?? 10} 题`;
  } else if (item.item_type === "vocab_drill") {
    description = `词汇练习 ${itemConfig.count ?? 10} 题`;
  } else if (item.item_type === "shadowing") {
    description = `跟读 ${itemConfig.sentence_count ?? 5} 个句子`;
  }

  // Build action href
  let href = "";
  if (item.item_type === "watch_video" && item.video_id) {
    href = `/watch/${item.video_id}`;
  } else if (item.item_type === "practice" && item.video_id) {
    href = `/watch/${item.video_id}`;
  } else if (item.item_type === "review_words" || item.item_type === "vocab_drill") {
    href = "/vocabulary";
  } else if (item.item_type === "shadowing" && item.video_id) {
    href = `/watch/${item.video_id}`;
  }

  if (item.completed || completing) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 py-3 px-4 rounded-lg border",
          completing ? "animate-complete-flash" : "bg-success-soft/30 border-success-soft"
        )}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-full bg-success-soft text-success flex items-center justify-center",
            completing && "animate-check-pop"
          )}
        >
          <Check size={16} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-muted line-through">{description}</div>
        </div>
        <span className="text-xs text-success font-medium">已完成</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-canvas border border-hairline hover:border-brand-200 hover:shadow-soft transition-all duration-150">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.color)}>
        <Icon size={16} />
      </div>
      <div className="flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {config.label}
        </div>
        <div className="text-sm font-medium text-ink mt-0.5">{description}</div>
      </div>
      {href ? (
        <Link
          href={href}
          className="flex items-center gap-1 text-xs font-semibold text-brand-500 hover:text-brand-600 transition-colors"
        >
          {config.action}
          <ArrowRight size={14} />
        </Link>
      ) : (
        <button
          onClick={handleComplete}
          className="flex items-center gap-1 text-xs font-semibold text-brand-500 hover:text-brand-600 transition-colors"
        >
          {config.action}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
