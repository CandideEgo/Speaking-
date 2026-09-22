"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import type { ChannelSummary } from "@/components/channels/ChannelStrip";

const PAGE_SIZE = 24;

interface ChannelsResponse {
  items: ChannelSummary[];
  page: number;
  page_size: number;
  has_more: boolean;
  total?: number;
}

/** 全部频道（ADR-0014 修订：全量作者页 - 策展频道在前，自动建档作者页按视频数排后）。 */
export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await api<ChannelsResponse>(
        `/api/v1/channels?page=${targetPage}&page_size=${PAGE_SIZE}`
      );
      setPage(targetPage);
      setHasMore(Boolean(data.has_more));
      setChannels((prev) => (append ? [...prev, ...data.items] : data.items));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(1, false);
  }, [load]);

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-10">
        <PageHeader crumb="频道" title="视频频道" />

        {error && <ErrorState title={error} onRetry={() => load(1, false)} className="py-8" />}

        {!error && loading && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-hairline overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-surface-card" />
                <div className="p-4 space-y-2">
                  <div className="h-4 w-1/2 rounded bg-surface-card" />
                  <div className="h-3 w-3/4 rounded bg-surface-card" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!error && !loading && channels.length === 0 && (
          <EmptyState icon={Radio} title="暂无频道" description="视频入库后作者频道会自动创建" />
        )}

        {!error && !loading && channels.length > 0 && (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {channels.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/channels/${ch.slug}`}
                  className="group rounded-xl border border-hairline bg-canvas overflow-hidden hover:border-hairline-strong transition-colors"
                >
                  <div className="relative aspect-video bg-surface-card">
                    <Image src={ch.cover_url} alt={ch.name} />
                  </div>
                  <div className="p-4">
                    <p className="text-[15px] font-bold text-ink group-hover:text-brand-500 transition-colors">
                      {ch.name}
                    </p>
                    {ch.description && (
                      <p className="text-[13px] text-muted mt-1 line-clamp-2">{ch.description}</p>
                    )}
                    <p className="text-[11px] text-muted mt-2">{ch.video_count} 个视频</p>
                  </div>
                </Link>
              ))}
            </div>

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
