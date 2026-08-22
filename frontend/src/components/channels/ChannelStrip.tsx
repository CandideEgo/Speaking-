"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";

export interface ChannelSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  video_count: number;
}

/**
 * Horizontal strip of curated channels (ADR-0014) for the browse page.
 * Silently renders nothing when there are no visible channels.
 */
export function ChannelStrip() {
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ items: ChannelSummary[] }>("/api/v1/channels")
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
        <h2 className="text-sm font-bold text-ink flex items-center gap-1.5">
          <Radio size={15} className="text-brand-500" />
          频道
        </h2>
        <Link href="/channels" className="text-xs text-muted hover:text-ink transition-colors">
          全部频道 →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
        {channels.map((ch) => (
          <Link
            key={ch.id}
            href={`/channels/${ch.slug}`}
            className="group flex-shrink-0 w-40 rounded-xl border border-hairline bg-canvas overflow-hidden hover:border-hairline-strong transition-colors"
          >
            <div className="relative aspect-video bg-surface-card">
              <Image src={ch.cover_url} alt={ch.name} />
            </div>
            <div className="px-3 py-2">
              <p className="text-[13px] font-semibold text-ink truncate group-hover:text-brand-500 transition-colors">
                {ch.name}
              </p>
              <p className="text-[11px] text-muted mt-0.5">{ch.video_count} 个视频</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
