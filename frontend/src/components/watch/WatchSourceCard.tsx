"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { userInitial } from "@/lib/avatar";
import { Image } from "@/components/ui/Image";
import { ChannelSubscribeButton } from "@/components/channels/ChannelSubscribeButton";
import { VideoMetadata } from "@/components/video/VideoMetadata";
import type { VideoCard } from "@/types";
import type { ChannelSummary } from "@/types/channels";

export function WatchSourceCard({ video }: { video: VideoCard }) {
  const [channel, setChannel] = useState<ChannelSummary | null>(null);
  useEffect(() => {
    setChannel(null);
    if (!video.channel_slug) return;
    const controller = new AbortController();
    api<{ channel: ChannelSummary }>(
      `/api/v1/channels/${encodeURIComponent(video.channel_slug)}?page_size=4`,
      { signal: controller.signal }
    )
      .then((data) => {
        if (!controller.signal.aborted) setChannel(data.channel);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [video.channel_slug]);
  return (
    <section aria-label="视频与频道信息" className="mt-5 space-y-3 rounded-lg bg-surface-soft p-4">
      <VideoMetadata video={video} />
      {video.channel_name && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={video.channel_slug ? `/channels/${video.channel_slug}` : "/channels"}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-card text-meta font-semibold text-muted">
              {video.channel_cover_url ? (
                <Image src={video.channel_cover_url} alt="" sizes="40px" />
              ) : (
                userInitial(video.channel_name)
              )}
            </span>
            <span className="min-w-0">
              <span className="block line-clamp-1 text-copy font-semibold text-ink">
                {video.channel_name}
              </span>
              {channel?.subscriber_count != null && (
                <span className="block text-caption text-muted">
                  {formatCount(channel.subscriber_count)} 人订阅 · 本站收录{" "}
                  {formatCount(channel.video_count)} 个视频
                </span>
              )}
            </span>
          </Link>
          {video.channel_slug && <ChannelSubscribeButton slug={video.channel_slug} />}
        </div>
      )}
    </section>
  );
}
