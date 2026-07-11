"use client";

import { useRouter } from "next/navigation";
import { Loader2, FileSearch, Subtitles } from "lucide-react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";

export interface SearchResultItem {
  id: string;
  title: string;
  video_source: string;
  thumbnail_url: string | null;
  difficulty_level: string | null;
  duration: number | null;
  is_official: boolean;
}

export interface SubtitleSnippet {
  id: string;
  text_en: string;
  start_time: number;
  end_time: number;
}

export interface SubtitleSearchResult {
  video: SearchResultItem;
  matching_subtitles: SubtitleSnippet[];
}

interface SearchDropdownProps {
  results: SearchResultItem[];
  subtitleResults: SubtitleSearchResult[];
  isLoading: boolean;
  query: string;
  onSelect: (videoId: string) => void;
  onClose: () => void;
}

function DifficultyBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const colors: Record<string, string> = {
    A1: "bg-green-100 text-green-700",
    A2: "bg-green-100 text-green-700",
    B1: "bg-blue-100 text-blue-700",
    B2: "bg-amber-100 text-amber-700",
    C1: "bg-red-100 text-red-700",
    C2: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${colors[level] || "bg-gray-100 text-gray-600"}`}
    >
      {level}
    </span>
  );
}

/** Format seconds to M:SS */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SearchDropdown({
  results,
  subtitleResults,
  isLoading,
  query,
  onSelect,
  onClose,
}: SearchDropdownProps) {
  const router = useRouter();

  function handleClick(videoId: string, startTime?: number) {
    onSelect(videoId);
    if (startTime !== undefined) {
      router.push(`/watch/${videoId}?t=${Math.floor(startTime)}`);
    } else {
      router.push(`/watch/${videoId}`);
    }
  }

  // Empty query — nothing to show
  if (!query.trim()) return null;

  const hasVideoResults = results.length > 0;
  const hasSubtitleResults = subtitleResults.length > 0;
  const hasAnyResults = hasVideoResults || hasSubtitleResults;

  // Loading state
  if (isLoading) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-md shadow-lg z-50 p-4 flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted">搜索中...</span>
      </div>
    );
  }

  // No results
  if (!hasAnyResults) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-md shadow-lg z-50 p-6 flex flex-col items-center gap-2">
        <FileSearch className="h-8 w-8 text-muted-soft" />
        <span className="text-sm text-muted">没有找到相关视频</span>
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-md shadow-lg z-50 max-h-[500px] overflow-y-auto">
      {/* Video results */}
      {hasVideoResults && (
        <div>
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            视频
          </div>
          <ul className="pb-1">
            {results.map((video) => (
              <li key={video.id}>
                <button
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-soft transition-colors text-left"
                  onClick={() => handleClick(video.id)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="flex-shrink-0 w-20 h-12 rounded overflow-hidden">
                    <VideoThumbnail
                      url={video.thumbnail_url}
                      title={video.title}
                      duration={video.duration}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink line-clamp-1">{video.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <DifficultyBadge level={video.difficulty_level} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Subtitle results */}
      {hasSubtitleResults && (
        <div className={hasVideoResults ? "border-t border-hairline" : ""}>
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Subtitles size={12} />
            字幕匹配
          </div>
          <ul className="pb-1">
            {subtitleResults.map((result) => (
              <li key={result.video.id}>
                {result.matching_subtitles.map((sub, si) => (
                  <button
                    key={sub.id}
                    className="w-full flex items-start gap-3 px-3 py-2 hover:bg-surface-soft transition-colors text-left"
                    onClick={() => handleClick(result.video.id, sub.start_time)}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div className="flex-shrink-0 w-20 h-8 rounded overflow-hidden mt-0.5">
                      <VideoThumbnail
                        url={result.video.thumbnail_url}
                        title={result.video.title}
                        duration={result.video.duration}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      {si === 0 && (
                        <p className="text-xs font-medium text-ink line-clamp-1">
                          {result.video.title}
                        </p>
                      )}
                      <p className="text-xs text-olive line-clamp-1 mt-0.5">
                        <span className="text-muted-foreground font-mono mr-1.5">
                          {formatTime(sub.start_time)}
                        </span>
                        {sub.text_en}
                      </p>
                    </div>
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
