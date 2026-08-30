"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";
import { Button } from "@/components/ui/Button";
import { VideoCard, VideoCardSkeleton, type VideoCardData } from "@/components/ui/VideoCard";
import { PageTransition } from "@/components/common/PageTransition";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { useUnlockedIds } from "@/hooks/useUnlockedIds";
import { formatViews } from "@/lib/format";
import { avatarColor, userInitial } from "@/lib/avatar";
import type { ChannelSummary } from "@/components/channels/ChannelStrip";

interface ChannelDetailResponse {
  channel: ChannelSummary;
  videos: {
    // 后端 _video_to_dict 下发 channel_name；VideoCard 读 channel_title，映射后再渲染。
    items: (VideoCardData & { channel_name?: string | null })[];
    page: number;
    page_size: number;
    total: number;
  };
}

const PAGE_SIZE = 20;

export default function ChannelDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [channel, setChannel] = useState<ChannelSummary | null>(null);
  const [videos, setVideos] = useState<VideoCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D0 解锁制：Free 视角的卡片角标（已解锁 ✓ / 锁标 / 耗尽灰度）
  const unlockedInfo = useUnlockedIds();

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await api<ChannelDetailResponse>(
          `/api/v1/channels/${slug}?page=${targetPage}&page_size=${PAGE_SIZE}`
        );
        setChannel(data.channel);
        setTotal(data.videos.total);
        setPage(targetPage);
        const mapped = data.videos.items.map((v) => ({
          ...v,
          channel_title: v.channel_title ?? v.channel_name ?? undefined,
        }));
        setVideos((prev) => (append ? [...prev, ...mapped] : mapped));
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    if (!slug) return;
    load(1, false);
  }, [slug, load]);

  const hasMore = videos.length < total;

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-10">
        <Link
          href="/channels"
          className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          全部频道
        </Link>

        {error && <ErrorState title={error} onRetry={() => load(1, false)} className="py-8" />}

        {!error && loading && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!error && channel && !loading && (
          <>
            {/* Channel header — banner 横条式（主流流媒体作者页布局，适配 16:9 兜底封面） */}
            <div className="mb-8">
              <div className="relative h-28 sm:h-40 lg:h-48 rounded-xl overflow-hidden border border-hairline bg-surface-card">
                <Image
                  src={channel.cover_url}
                  alt={channel.name}
                  fallback={
                    <div
                      className={`absolute inset-0 flex items-center justify-center text-4xl sm:text-5xl font-bold text-white/90 ${avatarColor(channel.name)}`}
                    >
                      {userInitial(channel.name)}
                    </div>
                  }
                />
                <div
                  className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent"
                  aria-hidden
                />
              </div>

              <div className="flex items-end gap-4 px-3 sm:px-5 -mt-8 sm:-mt-10">
                {/* 圆形头像：有封面用封面图，无封面用首字母渐变块 */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-canvas bg-surface-card flex-shrink-0 shadow-sm">
                  <Image
                    src={channel.cover_url}
                    alt=""
                    fallback={
                      <div
                        className={`absolute inset-0 flex items-center justify-center text-xl sm:text-2xl font-bold text-white ${avatarColor(channel.name)}`}
                      >
                        {userInitial(channel.name)}
                      </div>
                    }
                  />
                </div>
                <div className="min-w-0 pb-0.5">
                  <h1 className="text-lg sm:text-2xl font-extrabold text-ink flex items-center gap-1.5">
                    <span className="truncate">{channel.name}</span>
                    {channel.is_verified && (
                      <BadgeCheck
                        size={19}
                        className="text-brand-500 flex-shrink-0"
                        aria-label="已认证频道"
                      />
                    )}
                  </h1>
                  <p className="text-xs sm:text-[13px] text-muted mt-0.5">
                    {typeof channel.follower_count === "number" && (
                      <>{formatViews(channel.follower_count)} 粉丝 · </>
                    )}
                    {total} 个视频
                  </p>
                </div>
              </div>

              {channel.description && (
                <p className="text-[13px] text-muted mt-3 px-3 sm:px-5 leading-relaxed line-clamp-2">
                  {channel.description}
                </p>
              )}
            </div>

            {/* Videos */}
            {videos.length === 0 ? (
              <EmptyState icon={Radio} title="该频道暂无视频" description="稍后再来看看吧" />
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {videos.map((video) => (
                  <VideoCard
                    key={video.id || video.video_id}
                    video={video}
                    lockState={unlockedInfo?.lockStateFor(video)}
                  />
                ))}
              </div>
            )}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-10">
                <Button
                  variant="outline"
                  onClick={() => load(page + 1, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? "加载中…" : "加载更多"}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </PageTransition>
  );
}
