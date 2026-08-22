"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import type { ChannelSummary } from "@/components/channels/ChannelStrip";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ items: ChannelSummary[] }>("/api/v1/channels")
      .then((data) => !cancelled && setChannels(data.items))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "加载失败"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-10">
        <PageHeader crumb="发现" title="视频频道" />

        {error && <ErrorState title={error} className="py-8" />}

        {!error && channels === null && (
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

        {!error && channels !== null && channels.length === 0 && (
          <EmptyState icon={Radio} title="暂无频道" description="管理员还没有创建任何频道" />
        )}

        {!error && channels !== null && channels.length > 0 && (
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
        )}
      </main>
    </PageTransition>
  );
}
