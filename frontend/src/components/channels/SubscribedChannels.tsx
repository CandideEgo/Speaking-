"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Image } from "@/components/ui/Image";
import { LinkButton } from "@/components/ui/LinkButton";
import { VideoTitle } from "@/components/video/VideoTitle";
import { VideoMetadata } from "@/components/video/VideoMetadata";
import { userInitial } from "@/lib/avatar";
import { formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import type { ChannelSubscriptionSummary } from "@/types/channels";

/**
 * 「我订阅的频道」：把原来的频道名称标签升级成「可以接着学」的入口。
 *
 * 数据只有 `GET /api/v1/discovery/subscriptions` 的真实字段：优先显示最近一条
 * 未完成记录（标题 + 真实进度 + 继续按钮），否则显示最近收录（标题 + 时长），
 * 再否则显示「还有 N 段未学」。没有这些字段的条目只保留频道入口——不伪造
 * 「新增 / 未读 / 更新频率」这类服务端没有的说法。
 *
 * 订阅状态在页面里只取一次，由 `page.tsx` 传进来；组件自己不发请求。
 */
export function SubscribedChannels({ items }: { items: ChannelSubscriptionSummary[] }) {
  if (!items.length) return null;

  return (
    <section aria-labelledby="subscribed-channels-title" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="subscribed-channels-title" className="text-title font-bold text-ink">
          我订阅的频道
        </h2>
        <span className="text-meta tabular-nums text-muted">{items.length} 个</span>
      </div>
      <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <SubscriptionCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubscriptionCard({ item }: { item: ChannelSubscriptionSummary }) {
  const continueVideo = item.continue_video;
  const latest = item.latest_video;
  // 同 ChannelCard：回退成最新视频缩略图的 cover_url 不适合当圆形头像。
  const avatarUrl =
    item.cover_url && item.cover_url !== latest?.thumbnail_url ? item.cover_url : null;
  const progress = Math.round(Math.min(100, Math.max(0, continueVideo?.progress_percentage ?? 0)));
  const resumeHref = continueVideo
    ? watchHref(continueVideo.id, {
        from: "channel",
        extra: {
          slug: item.slug,
          t:
            continueVideo.position_seconds != null
              ? Math.floor(continueVideo.position_seconds)
              : undefined,
        },
      })
    : null;

  return (
    <Card
      as="article"
      padding={0}
      className="group flex h-full min-w-0 flex-col overflow-hidden transition-colors hover:border-hairline-strong"
    >
      <div className="flex min-w-0 items-center gap-3 p-3">
        <Link
          href={`/channels/${item.slug}`}
          tabIndex={-1}
          aria-hidden
          className="relative h-9 w-9 shrink-0 overflow-hidden rounded-pill border border-hairline bg-surface-card"
        >
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" sizes="36px" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-meta font-bold text-muted">
              {userInitial(item.name)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/channels/${item.slug}`}
            title={item.name}
            className="line-clamp-1 text-copy font-semibold text-ink transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {item.name}
          </Link>
          {item.description && (
            <p className="mt-0.5 line-clamp-1 text-caption text-muted">{item.description}</p>
          )}
        </div>
      </div>

      {continueVideo && resumeHref ? (
        <div className="mt-auto border-t border-hairline bg-surface-soft p-3">
          <p className="text-caption font-semibold text-brand-700">继续学习</p>
          <Link
            href={resumeHref}
            title={continueVideo.title}
            className="mt-1 block transition-colors hover:text-brand-700"
          >
            <VideoTitle
              video={continueVideo}
              as="span"
              zhClassName="text-meta font-medium leading-snug text-ink"
            />
          </Link>
          <VideoMetadata video={continueVideo} className="mt-1" />
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-card"
            role="progressbar"
            aria-label="学习进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-full rounded-pill bg-brand-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-caption tabular-nums text-muted">
            <span>已学 {progress}%</span>
            {continueVideo.duration != null && (
              <span>{formatDuration(continueVideo.duration)}</span>
            )}
          </div>
          <LinkButton
            variant="tonal"
            size="sm"
            href={resumeHref}
            icon={Play}
            fullWidth
            className="mt-2"
          >
            继续学习
          </LinkButton>
        </div>
      ) : latest ? (
        <Link
          href={watchHref(latest.id, { from: "channel", extra: { slug: item.slug } })}
          className="mt-auto flex items-start gap-2.5 border-t border-hairline bg-surface-soft p-3 transition-colors hover:bg-surface-card focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500"
        >
          <div className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-sm bg-surface-card">
            {latest.thumbnail_url ? (
              <Image src={latest.thumbnail_url} alt="" sizes="64px" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-muted">
                <Play size={12} aria-hidden />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-muted">最近收录</p>
            <VideoTitle
              video={latest}
              as="span"
              className="mt-0.5"
              zhClassName="text-meta font-medium leading-snug text-ink"
            />
            <VideoMetadata video={latest} className="mt-1" />
            {latest.duration != null && (
              <p className="mt-1 text-caption tabular-nums text-muted">
                {formatDuration(latest.duration)}
              </p>
            )}
          </div>
        </Link>
      ) : item.unlearned_count > 0 ? (
        <p className="mt-auto border-t border-hairline px-3 py-2.5 text-meta text-muted">
          还有 {item.unlearned_count} 段未学
        </p>
      ) : null}
    </Card>
  );
}
