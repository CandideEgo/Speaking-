"use client";

import Link from "next/link";
import { Clock, Play, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Image } from "@/components/ui/Image";
import { LinkButton } from "@/components/ui/LinkButton";
import { DifficultyBadge } from "@/components/video/DifficultyBadge";
import { VideoDescription } from "@/components/video/VideoDescription";
import { VideoTitle } from "@/components/video/VideoTitle";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { watchHref } from "@/lib/watchEntry";
import type { VideoCardData } from "@/components/ui/VideoCard";

/** 推荐依据：服务端只下发这两种；不认识的取值一律按「最近收录」处理。 */
export type ChannelStartBasis = "lowest_difficulty" | "latest";

export interface ChannelStartCardProps {
  video: VideoCardData;
  basis: ChannelStartBasis;
  /** 频道 slug：播放页据此回到本频道。 */
  slug: string;
}

/**
 * 频道页首的「先学哪一段」卡。
 *
 * 产品口径：只有 `basis=lowest_difficulty` 才配叫「推荐入门」，并写出依据
 *（全频道难度最低 · A2）；`basis=latest` 只写「最近收录」，绝不冒充推荐入门。
 * 封面/标题/难度/时长全部来自详情响应里的真实视频字段，缺字段就省略。
 */
export function ChannelStartCard({ video, basis, slug }: ChannelStartCardProps) {
  const videoId = String(video.id || video.video_id || "");
  if (!videoId) return null;

  const href = watchHref(videoId, { from: "channel", extra: { slug } });
  const isIntro = basis === "lowest_difficulty";
  const duration =
    video.duration != null && video.duration > 0 ? formatDuration(video.duration) : null;
  const basisText = isIntro
    ? video.difficulty_level
      ? `全频道难度最低 · ${video.difficulty_level}`
      : "全频道难度最低"
    : "本站最近收录的一段";

  return (
    <Card
      padding={0}
      className={cn(
        "overflow-hidden",
        isIntro ? "border-brand-200 bg-brand-50" : "bg-surface-soft"
      )}
    >
      {/* 手机整宽 16:9 + 下方正文：7rem 的侧栏裁出来只剩一条竖窄带，
          封面里的标题字被切掉一半，读不出这是什么视频。宽屏回到左右分栏。 */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <Link
          href={href}
          aria-label={`打开《${video.title}》`}
          className="group relative block aspect-video overflow-hidden bg-surface-card sm:aspect-auto sm:h-full sm:min-h-[4.5rem]"
        >
          <Image
            src={video.thumbnail_url}
            alt=""
            sizes="(max-width: 639px) 100vw, 272px"
            loading="eager"
            fallback={
              <span className="absolute inset-0 flex items-center justify-center">
                <Play className="size-8 text-muted" aria-hidden />
              </span>
            }
          />
          <DifficultyBadge
            level={video.difficulty_level}
            size="sm"
            className="absolute left-2 top-2"
          />
          {duration && (
            <span className="absolute bottom-2 right-2 rounded-sm bg-ink/85 px-1.5 py-0.5 font-mono text-caption font-semibold text-canvas">
              {duration}
            </span>
          )}
        </Link>

        <div className="flex min-w-0 flex-col gap-2 p-3 sm:gap-2.5 sm:p-5">
          <p
            className={cn(
              "flex flex-wrap items-center gap-1.5 text-caption font-bold",
              isIntro ? "text-brand-700" : "text-muted"
            )}
          >
            {isIntro ? <Sparkles size={13} aria-hidden /> : <Clock size={13} aria-hidden />}
            <span>{isIntro ? "推荐入门" : "最近收录"}</span>
            <span className="font-semibold text-muted">· {basisText}</span>
          </p>

          <Link
            href={href}
            title={video.title}
            className="block transition-colors hover:text-brand-700"
          >
            <VideoTitle
              video={video}
              as="span"
              zhClassName="break-words text-copy-lg font-bold leading-snug text-ink"
            />
          </Link>

          <VideoDescription description={video.description} />

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            <LinkButton href={href} size="sm" icon={Play}>
              {isIntro ? "从这里开始" : "打开这段"}
            </LinkButton>
            {duration && <span className="text-caption text-muted">时长 {duration}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}
