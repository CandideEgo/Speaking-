"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TabPills } from "@/components/ui/TabPills";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePlatformFeed } from "@/hooks/usePlatformFeed";
import { formatDuration } from "@/lib/format";
import { PageTransition } from "@/components/common/PageTransition";

const DIFFICULTY_LEVELS = [
  { id: "all", label: "全部" },
  { id: "A1", label: "A1" },
  { id: "A2", label: "A2" },
  { id: "B1", label: "B1" },
  { id: "B2", label: "B2" },
  { id: "C1", label: "C1" },
  { id: "C2", label: "C2" },
];

export default function BrowsePage() {
  const {
    categories,
    activeCategory,
    setActiveCategory,
    activeLevel,
    setActiveLevel,
    videos,
    loading,
    hasMore,
    total,
    error,
    retry,
    loaderRef,
  } = usePlatformFeed({ platform: "browse" });

  return (
    <PageTransition>
      <main className="container-page py-16 sm:py-24">
        {/* Page header */}
        <PageHeader
          crumb="发现"
          title="浏览视频"
          description="探索精选英语学习内容,按分类和难度筛选。点击任意视频开始学习。"
        />

        {/* Sticky filter bar */}
        <div className="filter-bar">
          {/* Category row */}
          <div className="filter-row">
            <span className="filter-label">分类</span>
            <TabPills
              tabs={categories.map((cat) => ({
                key: cat.id,
                label: cat.label,
              }))}
              activeKey={activeCategory}
              onChange={setActiveCategory}
              variant="ghost"
              activeStyle="dark"
              size="sm"
            />
          </div>
          {/* Difficulty row */}
          <div className="filter-row">
            <span className="filter-label">难度</span>
            <TabPills
              tabs={DIFFICULTY_LEVELS.map((lv) => ({
                key: lv.id,
                label: lv.label,
              }))}
              activeKey={activeLevel}
              onChange={setActiveLevel}
              variant="ghost"
              activeStyle="brand"
              size="sm"
            />
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="text-center py-8">
            <p className="text-sm text-red-500 mb-2">{error}</p>
            <Button onClick={retry} variant="outline">
              重试
            </Button>
          </div>
        )}

        {/* Results meta */}
        {!error && videos.length > 0 && (
          <p className="text-[13px] text-muted mb-4">
            显示 <b className="text-ink">{videos.length}</b> / {total} 个视频
          </p>
        )}

        {/* Video grid */}
        {!error && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((video) => (
              <Link
                key={video.id || video.video_id}
                href={`/watch/${video.id || video.video_id}`}
                className="vcard group"
              >
                <div className="thumb">
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span className="thumb-lv">
                    {video.difficulty_level || "B1"}
                  </span>
                  <span className="thumb-dur">
                    {formatDuration(video.duration)}
                  </span>
                  <div className="thumb-play">
                    <div className="thumb-play-btn">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="#fff"
                        stroke="none"
                      >
                        <path d="M6 4l14 8-14 8V4Z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="vmeta">
                  <p className="vtitle">{video.title}</p>
                  <div className="vfoot">
                    <span>{video.channel_title || "Speaking"}</span>
                    <span className="vdot" />
                    <span className="chip">
                      {video.topic_tags?.split(",")[0] || "综合"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && videos.length === 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="vcard animate-pulse">
                <div className="thumb bg-surface-card" />
                <div className="vmeta">
                  <div className="h-4 bg-surface-card rounded w-3/4 mb-2" />
                  <div className="h-3 bg-surface-card rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && videos.length === 0 && !error && (
          <div className="text-center py-16">
            <p className="text-sm text-muted">
              该分类下暂无视频,请尝试其他筛选条件
            </p>
          </div>
        )}

        {/* Load more / infinite scroll trigger */}
        <div ref={loaderRef} className="flex justify-center mt-8">
          {loading && videos.length > 0 && (
            <div className="w-5 h-5 border-2 border-muted-soft border-t-ink rounded-full animate-spin" />
          )}
          {!loading && hasMore && videos.length > 0 && (
            <Button
              variant="outline"
              className="mx-auto block"
              onClick={() => {
                const el = loaderRef.current;
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }}
            >
              加载更多
            </Button>
          )}
          {!hasMore && videos.length > 0 && (
            <p className="text-sm text-muted">已加载全部内容</p>
          )}
        </div>
      </main>
    </PageTransition>
  );
}
