"use client";

import { useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useCommunityStore } from "@/stores/communityStore";
import PostCard from "./PostCard";
import type { PostType, Post } from "@/types";

const FILTER_TABS: { value: PostType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "text", label: "Text" },
  { value: "progress", label: "Progress" },
  { value: "vocabulary", label: "Vocabulary" },
  { value: "speaking", label: "Speaking" },
];

export default function PostFeed() {
  const {
    posts,
    isLoading,
    hasMore,
    filterType,
    error,
    fetchPosts,
    likePost,
    unlikePost,
    setFilterType,
  } = useCommunityStore();

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchPosts(true);
  }, []);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && !isLoading) {
        fetchPosts();
      }
    },
    [hasMore, isLoading, fetchPosts]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: "200px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect]);

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-hairline pb-px scrollbar-hide">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilterType(tab.value)}
            className={cn(
              "shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
              filterType === tab.value
                ? "border-b-2 border-coral text-coral"
                : "text-muted-foreground hover:text-ink"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Posts list */}
      <div className="mt-4 space-y-4">
        {posts.length === 0 && !isLoading && !error && (
          <div className="flex flex-col items-center py-16">
            <p className="text-sm text-muted-foreground">No posts yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Be the first to share something!</p>
          </div>
        )}

        {posts.map((post: Post) => (
          <PostCard key={post.id} post={post} onLike={likePost} onUnlike={unlikePost} />
        ))}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!hasMore && posts.length > 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">No more posts</p>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
