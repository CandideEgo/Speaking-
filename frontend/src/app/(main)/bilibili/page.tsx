"use client";

import { useState, useEffect } from "react";
import { Loader2, Play, Flame, Trophy, TrendingUp } from "lucide-react";
import { usePlatformFeed } from "@/hooks/usePlatformFeed";
import { formatViews } from "@/lib/format";
import { api } from "@/lib/api";
import { SkeletonCardGrid } from "@/components/common/SkeletonCard";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { CategoryTabs } from "@/components/channel/CategoryTabs";
import { BannerCarousel } from "@/components/channel/BannerCarousel";
import { VideoCard } from "@/components/channel/VideoCard";

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface HotTag {
  tag: string;
  count: number;
}

interface RankingItem {
  id: string;
  title: string;
  thumbnail: string | null;
  difficulty: string | null;
  created_at: string;
}

interface BannerItem {
  id: string;
  title: string;
  thumbnail: string | null;
  link: string;
}

// ---------------------------------------------------------------------------
// Sidebar skeleton
// ---------------------------------------------------------------------------

function SidebarSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Hot tags skeleton */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-7 w-16 rounded-full bg-gray-100" />
          ))}
        </div>
      </div>
      {/* Ranking skeleton */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2 p-2">
              <div className="w-5 h-5 rounded bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-full rounded bg-gray-100" />
                <div className="h-2.5 w-12 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Trending skeleton */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-2">
              <div className="w-16 h-10 rounded bg-gray-100 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-full rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function BilibiliPage() {
  const {
    categories,
    activeCategory,
    setActiveCategory,
    videos,
    loading,
    hasMore,
    error,
    retry,
    loaderRef,
    addingId,
    startLearning,
  } = usePlatformFeed({ platform: "bilibili" });

  // Sidebar data state
  const [hotTags, setHotTags] = useState<HotTag[]>([]);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(true);

  // Fetch sidebar data on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchSidebarData() {
      setSidebarLoading(true);
      try {
        const [tagsRes, rankingsRes, bannersRes] = await Promise.allSettled([
          api<{ tags: HotTag[] }>("/api/v1/bilibili/hot-tags"),
          api<{ rankings: RankingItem[] }>("/api/v1/bilibili/rankings"),
          api<{ banners: BannerItem[] }>("/api/v1/bilibili/banners"),
        ]);

        if (cancelled) return;

        if (tagsRes.status === "fulfilled") {
          setHotTags(tagsRes.value.tags ?? []);
        }
        if (rankingsRes.status === "fulfilled") {
          setRankings(rankingsRes.value.rankings ?? []);
        }
        if (bannersRes.status === "fulfilled") {
          setBanners(bannersRes.value.banners ?? []);
        }
      } catch {
        // Silently fail — sidebar data is non-critical
      } finally {
        if (!cancelled) {
          setSidebarLoading(false);
        }
      }
    }

    fetchSidebarData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Map backend banner data to BannerCarousel's expected shape
  const carouselItems = banners.map((b) => ({
    id: b.id,
    image_url: b.thumbnail ?? "",
    title: b.title,
    link: b.link,
  }));

  return (
    <PageTransition>
      <main className="min-h-screen bg-white">
        <div className="flex">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Banner Carousel */}
            <div className="px-4 pt-4">
              <BannerCarousel items={carouselItems} />
            </div>

            {/* Category Tabs */}
            <div className="px-4 border-b border-[#e3e5e7]">
              <CategoryTabs
                categories={categories}
                activeId={activeCategory}
                onSelect={setActiveCategory}
                variant="underline"
                bgClass="bg-white"
              />
            </div>

            {/* Error State */}
            {error && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-red-500 mb-2">{error}</p>
                <button onClick={retry} className="text-sm text-[#00aeec] hover:underline">
                  重试
                </button>
              </div>
            )}

            {/* Video Grid */}
            <div className="px-4 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {videos.map((item) => (
                  <VideoCard
                    key={item.video_id}
                    variant="bilibili"
                    video={item}
                    onClick={() => startLearning(item)}
                    isLoading={addingId === item.video_id}
                  />
                ))}
              </div>

              {loading && videos.length === 0 && <SkeletonCardGrid count={8} className="mt-0" />}

              {!loading && videos.length === 0 && !error && (
                <EmptyState
                  icon={Play}
                  title="暂无内容"
                  description="该分类下暂无视频，请尝试其他分类"
                />
              )}

              <div ref={loaderRef} className="flex justify-center py-8">
                {loading && videos.length > 0 && (
                  <Loader2 size={24} className="animate-spin text-[#00aeec]" />
                )}
                {!hasMore && videos.length > 0 && (
                  <p className="text-sm text-[#9499a0]">已加载全部内容</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Recommendations */}
          <div className="hidden xl:block w-[280px] flex-shrink-0 px-4 py-4 border-l border-[#e3e5e7]">
            {sidebarLoading ? (
              <SidebarSkeleton />
            ) : (
              <>
                {/* Hot Tags */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Flame size={16} className="text-[#fb7299]" />
                    <h3 className="text-sm font-bold text-[#18191c]">热门标签</h3>
                  </div>
                  {hotTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {hotTags.map((item) => (
                        <button
                          key={item.tag}
                          className="px-3 py-1.5 text-xs rounded-full bg-[#f1f2f3] text-[#61666d] hover:bg-[#00aeec]/10 hover:text-[#00aeec] transition-colors"
                        >
                          {item.tag}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#9499a0]">暂无热门标签</p>
                  )}
                </div>

                {/* Ranking */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy size={16} className="text-[#ff7f24]" />
                    <h3 className="text-sm font-bold text-[#18191c]">排行榜</h3>
                  </div>
                  {rankings.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {rankings.map((item, index) => (
                        <a
                          key={item.id}
                          href={`/watch/${item.id}`}
                          className="flex items-start gap-2 p-2 rounded-lg hover:bg-[#f1f2f3] cursor-pointer transition-colors"
                        >
                          <span
                            className={`
                            flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold
                            ${index + 1 <= 3 ? "bg-[#ff7f24] text-white" : "bg-[#f1f2f3] text-[#9499a0]"}
                          `}
                          >
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[#18191c] line-clamp-2 leading-snug">
                              {item.title}
                            </p>
                            <p className="text-[10px] text-[#9499a0] mt-0.5">
                              {item.difficulty ? `${item.difficulty} · ` : ""}
                              {new Date(item.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#9499a0]">暂无排行数据</p>
                  )}
                </div>

                {/* Trending */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={16} className="text-[#00aeec]" />
                    <h3 className="text-sm font-bold text-[#18191c]">正在热播</h3>
                  </div>
                  {rankings.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {rankings.slice(0, 3).map((item, index) => (
                        <a
                          key={item.id}
                          href={`/watch/${item.id}`}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#f1f2f3] cursor-pointer transition-colors"
                        >
                          <div className="w-16 h-10 rounded bg-gradient-to-br from-[#00aeec]/20 to-[#fb7299]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {item.thumbnail ? (
                              <img
                                src={item.thumbnail}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-bold text-[#18191c]">{index + 1}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[#18191c] line-clamp-2 leading-snug">
                              {item.title}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#9499a0]">暂无热播数据</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
