"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import { Button } from "@/components/ui/Button";

interface PostComposerProps {
  /** Current user's avatar initial. */
  userInitial: string;
  /** Callback after a post is successfully created. */
  onCreated: () => void;
}

/**
 * Text-area + "发布" button for creating a new community post.
 * Extracted from the community page to reduce its size.
 */
export function PostComposer({ userInitial, onCreated }: PostComposerProps) {
  const [newPost, setNewPost] = useState("");

  async function handleCreatePost() {
    if (!newPost.trim()) return;
    const draft = newPost;
    try {
      await api("/api/v1/community/posts", {
        method: "POST",
        body: JSON.stringify({ content: draft, post_type: "text" }),
      });
      setNewPost("");
      onCreated();
    } catch (err) {
      toastApiError(err, "发布失败");
    }
  }

  return (
    <div className="bg-canvas border border-hairline rounded-lg p-4 mb-[18px]">
      <div className="flex gap-3 items-center">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-400 text-on-primary font-bold text-[13px] flex items-center justify-center flex-shrink-0">
          {userInitial}
        </div>
        <textarea
          placeholder="分享你的学习心得..."
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          className="flex-1 border-0 bg-surface-soft rounded-lg px-3.5 py-2.5 text-sm font-sans resize-none h-[42px] text-ink focus:bg-canvas focus:shadow-[0_0_0_2px_rgba(10,10,10,0.06)] focus:outline-none transition-colors"
        />
      </div>
      <div className="flex justify-between items-center mt-3">
        <span className="text-xs text-muted-soft">支持添加视频和图片</span>
        <Button onClick={handleCreatePost} size="sm">
          发布
        </Button>
      </div>
    </div>
  );
}
