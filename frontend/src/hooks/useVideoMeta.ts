"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

/** Check whether the current user has liked a video. */
async function getVideoLikeStatus(videoId: string): Promise<{ is_liked: boolean }> {
  return api<{ is_liked: boolean }>(`/api/v1/videos/${videoId}/like-status`);
}

/** Toggle like on a video; returns the new liked state. */
async function toggleVideoLike(videoId: string): Promise<{ liked: boolean }> {
  return api<{ liked: boolean }>(`/api/v1/videos/${videoId}/like`, { method: "POST" });
}

/** Hook for video meta interactions: favorite, like, note.
 *  Loads initial state on mount and provides toggle/save/clear actions
 *  with optimistic updates and rollback on failure.
 *
 *  `initialLikeCount` is the total like_count from the video detail payload
 *  (server of record). The local count is adjusted ±1 on toggle and rolled
 *  back on failure. */
export function useVideoMeta(videoId: string | undefined, initialLikeCount: number = 0) {
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [noteDraft, setNoteDraft] = useState("");

  // 在途的点赞/收藏请求：一次只处理一个，避免重复提交与乐观值被回滚覆盖。
  const likeInFlightRef = useRef(false);
  const favoriteInFlightRef = useRef(false);

  // Sync initial count when video detail loads (parent passes new value);
  // skipped while a like request is in flight so the optimistic count survives.
  useEffect(() => {
    if (likeInFlightRef.current) return;
    setLikeCount(initialLikeCount);
  }, [initialLikeCount]);

  // Load initial state
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    (async () => {
      try {
        const [meta, likeStatus] = await Promise.all([
          api<{ is_favorited: boolean; note: string }>(`/api/v1/videos/${videoId}/watch-meta`),
          getVideoLikeStatus(videoId).catch(() => ({ is_liked: false })),
        ]);
        if (cancelled) return;
        setIsFavorited(meta.is_favorited);
        setNoteDraft(meta.note || "");
        setIsLiked(likeStatus.is_liked);
      } catch {
        // non-fatal: favorite/note/like UI just stays at defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  async function toggleFavorite() {
    if (!videoId || favoriteInFlightRef.current) return;
    favoriteInFlightRef.current = true;
    const wasFavorited = isFavorited;
    setIsFavorited(!wasFavorited); // optimistic
    try {
      await api(`/api/v1/videos/${videoId}/favorite`, {
        method: wasFavorited ? "DELETE" : "POST",
      });
      toast.success(wasFavorited ? "已取消收藏" : "已收藏视频");
    } catch {
      setIsFavorited(wasFavorited); // rollback
      toast.error("操作失败，请重试");
    } finally {
      favoriteInFlightRef.current = false;
    }
  }

  async function toggleLike() {
    if (!videoId || likeInFlightRef.current) return;
    likeInFlightRef.current = true;
    const wasLiked = isLiked;
    const delta = wasLiked ? -1 : 1;
    setIsLiked(!wasLiked); // optimistic
    setLikeCount((c) => Math.max(0, c + delta)); // optimistic
    try {
      const res = await toggleVideoLike(videoId);
      setIsLiked(res.liked);
      toast.success(res.liked ? "已点赞" : "已取消点赞");
    } catch {
      setIsLiked(wasLiked); // rollback
      setLikeCount((c) => Math.max(0, c - delta)); // rollback
      toast.error("操作失败，请重试");
    } finally {
      likeInFlightRef.current = false;
    }
  }

  async function saveNote() {
    if (!videoId) return;
    try {
      await api(`/api/v1/videos/${videoId}/note`, {
        method: "PUT",
        body: JSON.stringify({ content: noteDraft.trim() }),
      });
      toast.success("笔记已保存");
    } catch {
      toast.error("笔记保存失败，请重试");
    }
  }

  async function clearNote() {
    if (!videoId) return;
    const saved = noteDraft;
    setNoteDraft("");
    try {
      await api(`/api/v1/videos/${videoId}/note`, { method: "DELETE" });
      toast.success("笔记已清空");
    } catch {
      setNoteDraft(saved); // rollback on failure
      toast.error("清空失败，请重试");
    }
  }

  return {
    isFavorited,
    isLiked,
    likeCount,
    noteDraft,
    setNoteDraft,
    toggleFavorite,
    toggleLike,
    saveNote,
    clearNote,
  };
}
