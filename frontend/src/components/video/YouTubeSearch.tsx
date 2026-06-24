"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Search, Loader2, Plus } from "lucide-react";
import type { Video, YouTubeSearchResponse, YouTubeSearchResult } from "@/types";

interface YouTubeSearchProps {
  onVideoAdded: (video: Video) => void;
}

export default function YouTubeSearch({ onVideoAdded }: YouTubeSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const data = await api<YouTubeSearchResponse>(
        `/api/v1/youtube/search?q=${encodeURIComponent(searchQuery)}`
      );
      setSearchResults(data.items);
      if (data.items.length === 0) toast.info("未找到相关视频");
    } catch {
      toast.error("搜索失败，请检查 API Key 配置");
    } finally {
      setSearching(false);
    }
  }

  async function addFromSearch(url: string, videoId: string) {
    setAddingId(videoId);
    try {
      const video = await api<Video>("/api/v1/videos", {
        method: "POST",
        body: JSON.stringify({ source_url: url }),
      });
      onVideoAdded(video);
      setSearchResults((prev) => prev.filter((item) => item.video_id !== videoId));
      toast.success("已添加到学习列表");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "添加失败");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <section className="container-page pb-8">
      <h2 className="font-display text-2xl font-normal text-ink tracking-display-md">
        搜索 YouTube
      </h2>
      <form onSubmit={handleSearch} className="mt-4 flex gap-3">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索英文视频，如 English interview, TED talk..."
            className="input-field pl-11"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="btn-primary whitespace-nowrap"
        >
          {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {searching ? "搜索中..." : "搜索"}
        </button>
      </form>

      {searchResults.length > 0 && (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {searchResults.map((item) => (
            <div
              key={item.video_id}
              className="rounded-lg border border-hairline bg-canvas overflow-hidden hover:border-coral/30 hover:shadow-sm transition-all"
            >
              <div className="relative aspect-video bg-cream-soft">
                {item.thumbnail_url && (
                  <img
                    src={item.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
              <div className="p-3.5">
                <p className="text-sm font-medium text-ink line-clamp-2">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                  {item.channel_title}
                </p>
                <button
                  onClick={() => addFromSearch(item.url, item.video_id)}
                  disabled={addingId === item.video_id}
                  className="mt-3 btn-primary w-full justify-center !py-2 text-xs"
                >
                  {addingId === item.video_id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  {addingId === item.video_id ? "添加中..." : "加入学习"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
