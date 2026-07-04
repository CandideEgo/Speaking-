"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import {
  ArrowLeft,
  SearchIcon,
  Loader2,
  FileSearch,
  Subtitles,
} from "lucide-react";

// --- Types (mirrored from SearchDropdown) ---

interface SearchResultItem {
  id: string;
  title: string;
  video_source: string;
  thumbnail_url: string | null;
  difficulty_level: string | null;
  duration: number | null;
  is_official: boolean;
}

interface SubtitleSnippet {
  id: string;
  text_en: string;
  start_time: number;
  end_time: number;
}

interface SubtitleSearchResult {
  video: SearchResultItem;
  matching_subtitles: SubtitleSnippet[];
}

// --- Helpers ---

function difficultyTone(level: string): BadgeTone {
  if (level === "A1" || level === "A2") return "green";
  if (level === "B1" || level === "B2") return "amber";
  if (level === "C1" || level === "C2") return "red";
  return "neutral";
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// --- Page ---

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [videoResults, setVideoResults] = useState<SearchResultItem[]>([]);
  const [subtitleResults, setSubtitleResults] = useState<
    SubtitleSearchResult[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setVideoResults([]);
      setSubtitleResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const [vResults, sResults] = await Promise.all([
        api<SearchResultItem[]>(
          `/api/v1/videos/search?q=${encodeURIComponent(searchQuery)}&limit=10`,
        ),
        api<SubtitleSearchResult[]>(
          `/api/v1/videos/search/subtitles?q=${encodeURIComponent(searchQuery)}&limit=5`,
        ).catch(() => [] as SubtitleSearchResult[]),
      ]);
      setVideoResults(vResults);
      setSubtitleResults(sResults);
      setHasSearched(true);
    } catch {
      setVideoResults([]);
      setSubtitleResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (!value.trim()) {
        setVideoResults([]);
        setSubtitleResults([]);
        setIsSearching(false);
        return;
      }
      debounceTimerRef.current = setTimeout(() => {
        performSearch(value);
      }, 300);
    },
    [performSearch],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      router.back();
    }
    if (e.key === "Enter" && videoResults.length > 0) {
      e.preventDefault();
      router.push(`/watch/${videoResults[0].id}`);
    }
  }

  function handleVideoClick(videoId: string, startTime?: number) {
    if (startTime !== undefined) {
      router.push(`/watch/${videoId}?t=${Math.floor(startTime)}`);
    } else {
      router.push(`/watch/${videoId}`);
    }
  }

  const hasVideoResults = videoResults.length > 0;
  const hasSubtitleResults = subtitleResults.length > 0;
  const hasAnyResults = hasVideoResults || hasSubtitleResults;

  return (
    <main className="min-h-full bg-canvas">
      {/* Search header */}
      <div className="sticky top-0 z-30 bg-canvas border-b border-hairline">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="返回"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="搜索视频或字幕..."
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-10 pl-10 pr-4 rounded-md bg-cream-soft border border-hairline
                         text-sm text-ink placeholder:text-muted-foreground
                         focus:border-coral focus:outline-none focus:ring-[3px] focus:ring-coral/15
                         transition-colors duration-150"
            />
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="px-4 py-4">
        {/* Loading */}
        {isSearching && (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-coral" />
            <span className="text-sm text-muted-foreground">搜索中...</span>
          </div>
        )}

        {/* No results */}
        {!isSearching && hasSearched && !hasAnyResults && (
          <div className="flex flex-col items-center gap-2 py-12">
            <FileSearch className="h-10 w-10 text-muted-foreground/40" />
            <span className="text-sm text-muted-foreground">
              没有找到相关视频
            </span>
          </div>
        )}

        {/* Initial state */}
        {!hasSearched && !isSearching && (
          <div className="flex flex-col items-center gap-2 py-12">
            <SearchIcon className="h-10 w-10 text-muted-foreground/30" />
            <span className="text-sm text-muted-foreground">
              输入关键词搜索视频或字幕
            </span>
          </div>
        )}

        {/* Video results */}
        {hasVideoResults && (
          <div>
            <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              视频
            </div>
            <ul className="space-y-1">
              {videoResults.map((video) => (
                <li key={video.id}>
                  <button
                    className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-cream-soft rounded-lg transition-colors text-left"
                    onClick={() => handleVideoClick(video.id)}
                  >
                    <div className="flex-shrink-0 w-24 h-14 rounded overflow-hidden">
                      <VideoThumbnail
                        url={video.thumbnail_url}
                        title={video.title}
                        duration={video.duration}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink line-clamp-2">
                        {video.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {video.difficulty_level && (
                          <Badge tone={difficultyTone(video.difficulty_level)}>
                            {video.difficulty_level}
                          </Badge>
                        )}
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
          <div
            className={
              hasVideoResults ? "mt-4 pt-4 border-t border-hairline" : ""
            }
          >
            <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Subtitles size={12} />
              字幕匹配
            </div>
            <ul className="space-y-1">
              {subtitleResults.map((result) => (
                <li key={result.video.id}>
                  {result.matching_subtitles.map((sub) => (
                    <button
                      key={sub.id}
                      className="w-full flex items-start gap-3 px-2 py-2.5 hover:bg-cream-soft rounded-lg transition-colors text-left"
                      onClick={() =>
                        handleVideoClick(result.video.id, sub.start_time)
                      }
                    >
                      <div className="flex-shrink-0 w-20 h-10 rounded overflow-hidden mt-0.5">
                        <VideoThumbnail
                          url={result.video.thumbnail_url}
                          title={result.video.title}
                          duration={result.video.duration}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-ink line-clamp-1">
                          {result.video.title}
                        </p>
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
    </main>
  );
}
