"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Image } from "@/components/ui/Image";
import { LinkButton } from "@/components/ui/LinkButton";
import { formatDuration, formatRelativeDay } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import { cn } from "@/lib/utils";
import type { LearningRecord } from "@/types";

/**
 * 首页第一主行动：继续上次。
 *
 * 只展示学习记录里真实存在的视频、进度与位置；位置作为 `t` 传给播放页，
 * 按钮文案（从 7:51 继续）与实际落点一致。没有可继续的记录时由父级换成
 * 「今天从这段开始」，这里不渲染空卡。
 */
export function ContinueLearningCard({ record }: { record: LearningRecord }) {
  const progress = Math.min(100, Math.max(0, Math.round(record.progress_percentage || 0)));
  const position =
    Number.isFinite(record.position_seconds) && record.position_seconds !== null
      ? Math.max(0, record.position_seconds)
      : null;
  const duration = record.video?.duration ?? null;
  const remaining = duration && position !== null ? Math.max(0, duration - position) : null;
  const lastSeen = formatRelativeDay(record.last_accessed_at ?? record.created_at);
  const title = record.video?.title || "上一段视频";
  const href = watchHref(record.video_id, {
    from: "home",
    extra: position !== null ? { t: Math.floor(position) } : undefined,
  });

  return (
    <section
      data-testid="continue-learning-rail"
      aria-label="继续学习"
      className="rounded-md border border-hairline bg-surface-soft p-4 sm:p-5"
    >
      <div className="flex flex-wrap gap-3 sm:flex-nowrap sm:items-center">
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden
          className="relative block w-20 sm:w-40 shrink-0 self-start overflow-hidden rounded-sm bg-surface-card aspect-video"
        >
          <Image
            src={record.video?.thumbnail_url}
            alt=""
            sizes="208px"
            fallback={
              <span className="absolute inset-0 grid place-items-center bg-surface-card text-muted">
                <Play size={24} aria-hidden />
              </span>
            }
          />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
            <span className="font-semibold text-brand-700">继续学习</span>
            {position !== null && <span>上次停在 {formatDuration(position)}</span>}
            {lastSeen && <span>· {lastSeen}</span>}
          </p>
          <h2 className="mt-1 line-clamp-2 text-title font-bold tracking-tight text-ink">
            <Link href={href} className="hover:text-brand-700" title={title}>
              {title}
            </Link>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted">
            {record.video?.channel_name && (
              <span className="hidden sm:block max-w-[18rem] truncate">
                {record.video.channel_name}
              </span>
            )}
            {record.video?.difficulty_level && (
              <span className="hidden sm:block">{record.video.difficulty_level}</span>
            )}
            <span className="tabular-nums">已看 {progress}%</span>
            {remaining !== null && (
              <span className="tabular-nums">还剩 {formatDuration(remaining)}</span>
            )}
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-card"
            role="progressbar"
            aria-label="观看进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-pill bg-brand-500 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-col sm:items-stretch">
          <LinkButton href={href} variant="primary" size="md" icon={Play}>
            继续学习{position !== null ? ` · ${formatDuration(position)}` : ""}
          </LinkButton>
          <Link
            href="/history"
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-1 text-meta text-muted",
              "hover:text-ink"
            )}
          >
            全部记录 <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
