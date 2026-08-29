"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/common/EmptyState";
import {
  ArrowLeft,
  SearchIcon,
  Loader2,
  FileSearch,
  Subtitles,
  Flame,
  History,
  X,
} from "lucide-react";

// D7 搜索历史（localStorage，最近 10 条）
const HISTORY_KEY = "seeword_search_history";

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string").slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 10)));
  } catch {
    /* 存储满/隐私模式 → 历史功能静默降级 */
  }
}

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
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [videoResults, setVideoResults] = useState<SearchResultItem[]>([]);
  const [subtitleResults, setSubtitleResults] = useState<SubtitleSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // D7：热门（后端）/ 历史（localStorage）/ 建议（后端下拉）
  const [hotTerms, setHotTerms] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus + load history + hot terms on mount
  useEffect(() => {
    inputRef.current?.focus();
    setHistory(loadHistory());
    api<{ hot: string[] }>("/api/v1/videos/search/hot")
      .then((d) => setHotTerms(d.hot ?? []))
      .catch(() => {});
  }, []);

  // Re-sync when navigating to /search?q=... (e.g. from a hot search chip)
  useEffect(() => {
    setQuery(initialQ);
    if (initialQ) {
      performSearch(initialQ);
    } else {
      setVideoResults([]);
      setSubtitleResults([]);
      setHasSearched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

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
          `/api/v1/videos/search?q=${encodeURIComponent(searchQuery)}&limit=10`
        ),
        api<SubtitleSearchResult[]>(
          `/api/v1/videos/search/subtitles?q=${encodeURIComponent(searchQuery)}&limit=5`
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

  /** 提交一次搜索：写历史、关建议、执行查询。 */
  const submitSearch = useCallback(
    (q: string) => {
      const term = q.trim();
      if (!term) return;
      setSuggestOpen(false);
      setActiveIdx(-1);
      setQuery(term);
      setHistory((prev) => {
        const next = [term, ...prev.filter((h) => h !== term)].slice(0, 10);
        saveHistory(next);
        return next;
      });
      performSearch(term);
    },
    [performSearch]
  );

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      setHasSearched(false);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (!value.trim()) {
        setVideoResults([]);
        setSubtitleResults([]);
        setIsSearching(false);
        setSuggestions([]);
        setSuggestOpen(false);
        return;
      }
      // D7：输入 ≥2 字拉取建议（防抖 300ms），同时预查结果
      if (value.trim().length >= 2) {
        debounceTimerRef.current = setTimeout(() => {
          api<{ suggestions: string[] }>(
            `/api/v1/videos/search/suggest?q=${encodeURIComponent(value.trim())}&limit=8`
          )
            .then((d) => {
              setSuggestions(d.suggestions ?? []);
              setSuggestOpen(true);
              setActiveIdx(-1);
            })
            .catch(() => setSuggestions([]));
          performSearch(value);
        }, 300);
      } else {
        setSuggestions([]);
        setSuggestOpen(false);
        debounceTimerRef.current = setTimeout(() => {
          performSearch(value);
        }, 300);
      }
    },
    [performSearch]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // 建议下拉打开时：键盘导航优先
    if (suggestOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIdx >= 0) {
          submitSearch(suggestions[activeIdx]);
        } else {
          submitSearch(query);
        }
        return;
      }
      if (e.key === "Escape") {
        setSuggestOpen(false);
        return;
      }
    }
    if (e.key === "Escape") {
      router.back();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (query.trim()) {
        submitSearch(query);
      } else if (videoResults.length > 0) {
        router.push(`/watch/${videoResults[0].id}`);
      }
    }
  }

  function handleVideoClick(videoId: string, startTime?: number) {
    if (startTime !== undefined) {
      router.push(`/watch/${videoId}?t=${Math.floor(startTime)}`);
    } else {
      router.push(`/watch/${videoId}`);
    }
  }

  function removeHistoryItem(term: string) {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== term);
      saveHistory(next);
      return next;
    });
  }

  const hasVideoResults = videoResults.length > 0;
  const hasSubtitleResults = subtitleResults.length > 0;
  const hasAnyResults = hasVideoResults || hasSubtitleResults;
  const showDiscovery = !hasSearched && !isSearching && !query.trim();

  return (
    <main className="min-h-full bg-canvas">
      {/* Search header */}
      <div className="sticky top-0 z-30 bg-canvas border-b border-hairline">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="返回">
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
              onFocus={() => {
                if (suggestions.length > 0 && query.trim().length >= 2) setSuggestOpen(true);
              }}
              onBlur={() => {
                // 延迟关闭，让点击建议项的 onClick 先触发
                setTimeout(() => setSuggestOpen(false), 150);
              }}
              className="w-full h-10 pl-10 pr-4 rounded-md bg-surface-soft border border-hairline
                         text-sm text-ink placeholder:text-muted
                         focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/15
                         transition-colors duration-150"
            />
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />

            {/* D7 搜索建议下拉 */}
            {suggestOpen && suggestions.length > 0 && (
              <ul
                className="absolute left-0 right-0 top-11 z-40 rounded-md border border-hairline bg-surface-card shadow-lg overflow-hidden"
                role="listbox"
              >
                {suggestions.map((s, i) => (
                  <li key={s} role="option" aria-selected={i === activeIdx}>
                    <button
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        i === activeIdx
                          ? "bg-surface-soft text-ink"
                          : "text-body hover:bg-surface-soft"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault(); // 避免 input 先 blur 导致点击失效
                        submitSearch(s);
                      }}
                      onMouseEnter={() => setActiveIdx(i)}
                    >
                      <SearchIcon size={13} className="flex-shrink-0 text-muted-soft" />
                      <span className="truncate">{s}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="container-page py-4">
        {/* Loading */}
        {isSearching && (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            <span className="text-sm text-muted">搜索中...</span>
          </div>
        )}

        {/* No results */}
        {!isSearching && hasSearched && !hasAnyResults && (
          <EmptyState
            icon={FileSearch}
            title="没有找到相关视频"
            description="试试换个关键词，或从下方热门搜索开始"
            action={
              hotTerms.length > 0 ? (
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {hotTerms.map((kw) => (
                    <Link
                      key={kw}
                      href={`/search?q=${encodeURIComponent(kw)}`}
                      className="px-3 py-1.5 rounded-pill text-xs font-medium bg-surface-card text-body hover:bg-brand-50 hover:text-brand-500 transition-colors"
                    >
                      {kw}
                    </Link>
                  ))}
                </div>
              ) : undefined
            }
          />
        )}

        {/* D7 发现态：热门搜索 + 搜索历史 */}
        {showDiscovery && (
          <div className="space-y-8 py-6">
            {hotTerms.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted mb-3">
                  <Flame size={12} className="text-brand-500" />
                  热门搜索
                </h2>
                <div className="flex flex-wrap gap-2">
                  {hotTerms.map((kw, i) => (
                    <button
                      key={kw}
                      onClick={() => submitSearch(kw)}
                      className="px-3 py-1.5 rounded-pill text-xs font-medium bg-surface-card text-body hover:bg-brand-50 hover:text-brand-500 transition-colors"
                    >
                      <span className="mr-1.5 font-mono text-muted-soft">{i + 1}</span>
                      {kw}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {history.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted mb-3">
                  <History size={12} />
                  搜索历史
                </h2>
                <div className="flex flex-wrap gap-2">
                  {history.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-pill text-xs font-medium bg-surface-card text-body"
                    >
                      <button
                        onClick={() => submitSearch(kw)}
                        className="hover:text-brand-500 transition-colors"
                      >
                        {kw}
                      </button>
                      <button
                        onClick={() => removeHistoryItem(kw)}
                        aria-label={`删除「${kw}」`}
                        className="p-0.5 rounded-full text-muted-soft hover:text-ink transition-colors"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            )}
            {hotTerms.length === 0 && history.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12">
                <SearchIcon className="h-10 w-10 text-muted/30" />
                <span className="text-sm text-muted">输入关键词搜索视频或字幕</span>
              </div>
            )}
          </div>
        )}

        {/* Video results */}
        {hasVideoResults && (
          <div>
            <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center justify-between">
              <span>视频</span>
              <span className="text-muted-soft normal-case font-medium tracking-normal">
                {videoResults.length} 个结果
              </span>
            </div>
            <ul className="space-y-1">
              {videoResults.map((video) => (
                <li key={video.id}>
                  <button
                    className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-surface-soft rounded-lg transition-colors text-left"
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
                      <p className="text-sm font-medium text-ink line-clamp-2">{video.title}</p>
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
          <div className={hasVideoResults ? "mt-4 pt-4 border-t border-hairline" : ""}>
            <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Subtitles size={12} />
              字幕匹配
              <span className="text-muted-soft normal-case font-medium tracking-normal">
                {subtitleResults.reduce((s, r) => s + r.matching_subtitles.length, 0)} 条
              </span>
            </div>
            <ul className="space-y-1">
              {subtitleResults.map((result) => (
                <li key={result.video.id}>
                  {result.matching_subtitles.map((sub) => (
                    <button
                      key={sub.id}
                      className="w-full flex items-start gap-3 px-2 py-2.5 hover:bg-surface-soft rounded-lg transition-colors text-left"
                      onClick={() => handleVideoClick(result.video.id, sub.start_time)}
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
                        <p className="text-xs text-muted line-clamp-1 mt-0.5">
                          <span className="text-muted font-mono mr-1.5">
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
