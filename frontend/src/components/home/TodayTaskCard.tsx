"use client";

import Link from "next/link";
import { ArrowUpRight, Play, Timer } from "lucide-react";
import { Image } from "@/components/ui/Image";
import { LinkButton } from "@/components/ui/LinkButton";
import { DifficultyBadge } from "@/components/video/DifficultyBadge";
import { VideoStats } from "@/components/video/VideoStats";
import { VideoTitle } from "@/components/video/VideoTitle";
import { formatDuration } from "@/lib/format";
import { clipDurationLabel } from "@/lib/homeEditorial";
import { taskFullVideoHref, taskPrimaryAction, type HomeTask } from "@/lib/homeTask";
import { cn } from "@/lib/utils";

/**
 * 首页今日学习任务：一个视频只留一个主行动。
 *
 * - 有真实片段：主按钮「听懂这段 · 49 秒」直接跳到片段起点并请求播放；
 * - 无片段：主按钮退回「从这段开始 · 9:24」，不编造秒数；
 * - 「看完整视频」只是次级入口，不再和封面播放键重复；
 * - 标题用中英文原名，互动数只取站内点赞/播放/收藏（0 也显示）。
 */
export function TodayTaskCard({
  task,
  primary = false,
  className,
  hideCover = false,
  hideSentence = false,
}: {
  task: HomeTask;
  /** 没有可继续记录时，这张卡就是首屏主行动。 */
  primary?: boolean;
  className?: string;
  hideCover?: boolean;
  /** 同一句已在旁边的场景卡里出现时，任务卡不再重复。 */
  hideSentence?: boolean;
}) {
  const action = taskPrimaryAction(task);
  const fullHref = taskFullVideoHref(task);
  const clipLabel = task.clip ? clipDurationLabel(task.clip.duration) : null;
  const eyebrow =
    task.variant === "fallback" ? "今天推荐" : primary ? "今天从这段开始" : "今日精选 · 学习任务";

  return (
    <article
      className={cn(
        "home-editorial-lead rounded-md border border-hairline bg-canvas p-4 sm:p-5",
        primary && "border-hairline-strong",
        className
      )}
      aria-label="今日学习任务"
    >
      <div
        className={cn(
          "grid gap-5 md:items-center",
          !hideCover && "md:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]"
        )}
      >
        {!hideCover && (
          <div className="relative aspect-video overflow-hidden rounded-sm bg-surface-card">
            <Image
              src={task.video.thumbnail_url}
              alt=""
              loading="eager"
              sizes="(max-width: 767px) 100vw, 42vw"
              fallback={
                <span className="absolute inset-0 grid place-items-center text-muted">
                  <Play size={28} aria-hidden />
                </span>
              }
            />
            {task.video.difficulty_level && (
              <DifficultyBadge
                level={task.video.difficulty_level}
                size="sm"
                className="absolute left-2 top-2"
              />
            )}
            {(clipLabel || task.video.duration) && (
              <span
                className="absolute bottom-2 right-2 rounded-sm px-1.5 py-0.5 font-mono text-caption font-semibold text-white"
                style={{ background: "rgba(10, 10, 10, 0.78)" }}
              >
                {clipLabel ?? formatDuration(task.video.duration)}
              </span>
            )}
          </div>
        )}

        <div className="min-w-0">
          <p className="text-meta font-semibold text-brand-700">{eyebrow}</p>
          <VideoTitle
            video={task.video}
            as="h2"
            className="mt-1"
            zhClassName="text-title font-bold tracking-tight text-ink"
          />
          <VideoStats
            likeCount={task.video.like_count}
            viewCount={task.video.view_count}
            favoriteCount={task.video.favorite_count}
            className="mt-1.5"
          />

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
            {task.themeLabel && (
              <span className="rounded-pill bg-surface-card px-2 py-0.5 font-semibold text-body">
                {task.themeLabel}
              </span>
            )}
            {task.clip && clipLabel && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Timer size={13} aria-hidden /> 片段 {clipLabel}
              </span>
            )}
            {!task.clip && task.video.duration != null && (
              <span className="tabular-nums">完整视频 {formatDuration(task.video.duration)}</span>
            )}
            {task.sourceLabel &&
              (task.video.channel_slug ? (
                <Link
                  href={`/channels/${task.video.channel_slug}`}
                  className="max-w-[18rem] truncate hover:text-ink"
                >
                  {task.sourceLabel}
                </Link>
              ) : (
                <span className="max-w-[18rem] truncate">{task.sourceLabel}</span>
              ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <LinkButton
              href={action.href}
              variant={primary ? "primary" : "outline"}
              size="md"
              icon={Play}
            >
              {action.label}
            </LinkButton>
            {task.clip && (
              <Link
                href={fullHref}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-sm px-2 text-meta font-medium text-body transition-colors hover:bg-surface-soft hover:text-ink"
              >
                看完整视频
                {task.video.duration != null && (
                  <span className="tabular-nums text-muted">
                    · {formatDuration(task.video.duration)}
                  </span>
                )}
                <ArrowUpRight size={13} aria-hidden />
              </Link>
            )}
          </div>

          {!hideSentence && task.sentence && (
            <blockquote className="mt-3 border-l-2 border-brand-200 pl-3">
              <p className="line-clamp-2 text-copy leading-relaxed text-ink">
                {task.sentence.text_en}
              </p>
              {task.sentence.text_zh && (
                <p className="mt-0.5 line-clamp-2 text-meta leading-relaxed text-muted">
                  {task.sentence.text_zh}
                </p>
              )}
            </blockquote>
          )}
        </div>
      </div>
    </article>
  );
}
