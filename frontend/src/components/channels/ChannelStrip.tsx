"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";
import { Card } from "@/components/ui/Card";
import type { ChannelSummary } from "@/types/channels";

// 频道数据契约的家在 `types/channels.ts`；这里保留 re-export，避免既有调用点
// 为了一个纯类型搬家产生无意义 diff。
export type { ChannelLatestVideo, ChannelSummary } from "@/types/channels";

/**
 * Horizontal strip of channels (ADR-0014, full author pages) for the browse
 * page - top rows only (curated first, then biggest auto author pages).
 * Silently renders nothing when there are no visible channels.
 */
export function ChannelStrip() {
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ items: ChannelSummary[] }>("/api/v1/channels?page_size=12")
      .then((data) => !cancelled && setChannels(data.items))
      .catch(() => !cancelled && setChannels([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!channels || channels.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-copy font-bold text-ink flex items-center gap-1.5">
          <Radio size={15} className="text-brand-500" />
          频道
        </h2>
        <Link href="/channels" className="text-meta text-muted hover:text-ink transition-colors">
          全部频道 →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
        {channels.map((ch) => (
          <Card
            as={Link}
            key={ch.id}
            href={`/channels/${ch.slug}`}
            padding={0}
            className="group flex-shrink-0 w-40 overflow-hidden hover:border-hairline-strong transition-colors"
          >
            <div className="relative aspect-video bg-surface-card">
              <Image src={ch.cover_url} alt={ch.name} />
            </div>
            <div className="px-3 py-2">
              <p className="text-copy font-semibold text-ink truncate group-hover:text-brand-500 transition-colors">
                {ch.name}
              </p>
              <p className="text-caption text-muted mt-0.5">{ch.video_count} 个视频</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
