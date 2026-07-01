"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getVideoLikeStatus, toggleVideoLike } from "@/lib/creatorData";

/** Hook for video meta interactions: favorite, like, note.
 *  Loads initial state on mount and provides toggle/save/clear actions
 *  with optimistic updates and rollback on failure. */
export function useVideoMeta(videoId: string | undefined) {
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  // Load initial state
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    (async () => {
      try {
        const [meta, likeStatus] = await Promise.all([
          api<{ is_favorited: boolean; note: string }>(
            `/api/v1/videos/${videoId}/watch-meta`,
          ),
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
    if (!videoId) return;
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
    }
  }

  async function toggleLike() {
    if (!videoId) return;
    const wasLiked = isLiked;
    setIsLiked(!wasLiked); // optimistic
    try {
      const res = await toggleVideoLike(videoId);
      setIsLiked(res.liked);
      toast.success(res.liked ? "已点赞" : "已取消点赞");
    } catch {
      setIsLiked(wasLiked); // rollback
      toast.error("操作失败，请重试");
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
    noteDraft,
    setNoteDraft,
    toggleFavorite,
    toggleLike,
    saveNote,
    clearNote,
  };
}
