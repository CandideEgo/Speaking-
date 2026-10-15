"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { scrollKey } from "@/lib/scrollMemory";
import { watchHref } from "@/lib/watchEntry";
import { VideoCard, VideoCardSkeleton } from "@/components/ui/VideoCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/EmptyState";
import { FullPageSpinner } from "@/components/common/Spinner";
import type { Paginated, VideoCard as VideoCardDTO } from "@/types";

/**
 * 我的收藏 (Phase 1 D13).
 * Paginated list of the current user's favorited videos (GET /videos/favorites).
 *
 * 这里曾有一份本地 `FavoriteVideoItem`（少了 status/is_official/created_at，又把
 * note_excerpt 写成必填）。后端现在 4 个卡片端点共用一张形状，收藏列表只是多了
 * `note_excerpt` / `has_note` / `favorited_at` 三个注解字段 —— 用共享卡片类型即可。
 *
 * 类型这份起别名，是因为同名的 `VideoCard` 组件也在本文件里（同一个概念，一个模块
 * 里名字只能活一个）。
 */
export default function FavoritesPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fetcher = useCallback(
    (page: number) =>
      api<Paginated<VideoCardDTO>>(`/api/v1/videos/favorites?page=${page}&page_size=20`),
    []
  );

  const { items, setItems, loading, hasMore, loaderRef, total, reload } =
    usePaginatedList<VideoCardDTO>({
      fetcher,
      mode: "append",
      enabled: isAuthenticated && !isLoading,
    });

  useScrollRestore(scrollKey(pathname, searchParams.toString()), items.length > 0);

  async function handleUnfavorite(videoId: string, title: string) {
    setRemovingIds((prev) => new Set(prev).add(videoId));
    try {
      await api(`/api/v1/videos/${videoId}/favorite`, { method: "DELETE" });
      setItems((prev) => prev.filter((v) => v.id !== videoId));
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
      toast.success(`已取消收藏：${title}`, {
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              await api(`/api/v1/videos/${videoId}/favorite`, { method: "POST" });
              reload();
              toast.success("已恢复收藏");
            } catch {
              toast.error("恢复失败，请重试");
            }
          },
        },
        duration: 5000,
      });
      setTimeout(() => reload(), 0);
    } catch {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
      toast.error("取消收藏失败，请重试");
    }
  }

  if (isLoading) return <FullPageSpinner />;

  const visible = items.filter((v) => !removingIds.has(v.id));

  return (
    <PageTransition>
      <main className="py-6 sm:py-12">
        <PageHeader
          crumb="我的"
          title="我的收藏"
          description={
            total > 0 ? `共 ${total} 个视频，按收藏时间倒序` : "看视频时点击书签图标就能收藏"
          }
        />

        {loading && items.length === 0 ? (
          <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]">
            {Array.from({ length: 4 }).map((_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="还没有收藏的视频"
            description="看到喜欢的视频点书签图标收藏，下次就能从这里直接进入"
            action={
              <Link
                href="/browse"
                className="inline-block mt-3 text-copy font-semibold text-brand-500 hover:underline"
              >
                去频道看看 →
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]">
              {visible.map((v) => (
                <div key={v.id} className="relative group">
                  <VideoCard
                    video={{
                      id: v.id,
                      title: v.title,
                      thumbnail_url: v.thumbnail_url,
                      duration: v.duration,
                      difficulty_level: v.difficulty_level,
                      topic_tags: v.topic_tags,
                      channel_title: v.channel_name ?? "SeeWord",
                      channel_slug: v.channel_slug ?? undefined,
                      storage_mode: v.storage_mode,
                      view_count: v.view_count,
                      favorite_count: v.favorite_count,
                      description: v.description,
                    }}
                    entry={{ from: "favorites" }}
                    footer={
                      v.has_note && v.note_excerpt ? (
                        <Link
                          href={watchHref(v.id, { from: "favorites", extra: { note: 1 } })}
                          onClick={(e) => e.stopPropagation()}
                          className="block text-caption text-muted hover:text-ink transition-colors line-clamp-2 mt-1 px-1"
                        >
                          <span className="text-muted-soft">笔记 · </span>
                          {v.note_excerpt}
                        </Link>
                      ) : undefined
                    }
                  />
                  <button
                    onClick={() => handleUnfavorite(v.id, v.title)}
                    aria-label="取消收藏"
                    title="取消收藏"
                    className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/55 text-white backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {hasMore && (
              <div ref={loaderRef} className="flex justify-center py-8">
                <span className="text-meta text-muted-soft">加载更多…</span>
              </div>
            )}
          </>
        )}
      </main>
    </PageTransition>
  );
}
