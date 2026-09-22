"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Image } from "@/components/ui/Image";

/**
 * 播放页频道入口卡（发现→频道改版）：播放器正下方的显形入口，
 * 比 meta 细行里的频道名文字链接更显眼。仅当视频挂载了频道时由
 * 播放页渲染；无封面时用频道名首字母兜底。
 */
export function ChannelEntry({
  slug,
  name,
  coverUrl,
}: {
  slug: string;
  name: string;
  coverUrl?: string | null;
}) {
  return (
    <Link
      href={`/channels/${slug}`}
      className="group mt-3 flex items-center gap-3 rounded-xl border border-hairline bg-canvas px-4 py-3 hover:border-hairline-strong transition-colors"
    >
      {coverUrl ? (
        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-surface-card flex-shrink-0">
          <Image src={coverUrl} alt={name} sizes="40px" imgClassName="object-cover" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-on-primary text-sm font-bold flex-shrink-0">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-ink truncate group-hover:text-brand-500 transition-colors">
          {name}
        </p>
        <p className="text-[11px] text-muted mt-0.5">频道</p>
      </div>
      <span className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand-500 flex-shrink-0">
        进入频道
        <ChevronRight size={15} />
      </span>
    </Link>
  );
}
