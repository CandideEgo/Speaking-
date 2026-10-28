import { Bookmark, CalendarDays, Play } from "lucide-react";
import { formatCount, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface VideoMetadataData {
  view_count?: number | null;
  favorite_count?: number | null;
  upload_date?: string | null;
  published_at?: string | null;
  created_at?: string | null;
}

/** Every video surface shares count and publication semantics, including zero. */
export function VideoMetadata({
  video,
  className,
}: {
  video: VideoMetadataData;
  className?: string;
}) {
  const published = video.upload_date || video.published_at || video.created_at;
  const dateLabel = video.upload_date ? "原片发布" : "本站收录";
  const date = published ? timeAgo(published) : "";
  return (
    <div
      className={cn(
        "video-metadata flex flex-wrap items-center gap-x-3 gap-y-1 text-caption tabular-nums text-muted",
        className
      )}
    >
      {video.view_count != null && (
        <span
          className="inline-flex items-center gap-1"
          title="本站播放完成次数"
          aria-label={`本站播放 ${formatCount(video.view_count)} 次`}
        >
          <Play size={13} aria-hidden />
          {formatCount(video.view_count)}
        </span>
      )}
      {date && (
        <time
          className="inline-flex items-center gap-1"
          dateTime={published ?? undefined}
          title={`${dateLabel}：${published}`}
          aria-label={`${dateLabel} ${date}`}
        >
          <CalendarDays size={13} aria-hidden />
          {date}
        </time>
      )}
      {video.favorite_count != null && (
        <span
          className="inline-flex items-center gap-1"
          title="本站收藏数"
          aria-label={`收藏 ${formatCount(video.favorite_count)} 次`}
        >
          <Bookmark size={13} aria-hidden />
          {formatCount(video.favorite_count)}
        </span>
      )}
    </div>
  );
}
