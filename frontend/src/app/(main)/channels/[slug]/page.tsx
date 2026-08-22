"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";
import { Button } from "@/components/ui/Button";
import { VideoCard, VideoCardSkeleton, type VideoCardData } from "@/components/ui/VideoCard";
import { PageTransition } from "@/components/common/PageTransition";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import type { ChannelSummary } from "@/components/channels/ChannelStrip";

interface ChannelDetailResponse {
  channel: ChannelSummary;
  videos: {
    items: VideoCardData[];
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
        setVideos((prev) => (append ? [...prev, ...data.videos.items] : data.videos.items));
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
            {/* Channel header */}
            <div className="flex items-center gap-5 mb-8">
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border border-hairline bg-surface-card flex-shrink-0">
                <Image src={channel.cover_url} alt={channel.name} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-extrabold text-ink flex items-center gap-2">
                  <Radio size={20} className="text-brand-500 flex-shrink-0" />
                  {channel.name}
                </h1>
                {channel.description && (
                  <p className="text-[13px] text-muted mt-1.5 leading-relaxed line-clamp-2">
                    {channel.description}
                  </p>
                )}
                <p className="text-xs text-muted mt-2">{total} 个视频</p>
              </div>
            </div>

            {/* Videos */}
            {videos.length === 0 ? (
              <EmptyState icon={Radio} title="该频道暂无视频" description="稍后再来看看吧" />
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {videos.map((video) => (
                  <VideoCard key={video.id || video.video_id} video={video} />
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
