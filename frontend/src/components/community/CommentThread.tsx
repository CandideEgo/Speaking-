"use client";

import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface PostUser {
  id: string;
  name: string | null;
  avatar_url: string | null;
  level: string | null;
}

interface Comment {
  id: string;
  content: string;
  parent_id: string | null;
  like_count: number;
  is_liked: boolean;
  created_at: string;
  user: PostUser;
  replies: Comment[];
}

interface CommentThreadProps {
  /** ID of the post this comment thread belongs to. */
  postId: string;
  /** Current comments for this post. */
  comments: Comment[];
  /** Whether comments are currently loading. */
  loading: boolean;
  /** Draft text for the comment input. */
  draft: string;
  /** Update the draft text. */
  onDraftChange: (value: string) => void;
  /** Callback after a comment is successfully added. */
  onCommentAdded: (comment: Comment) => void;
}

/**
 * Expandable comment thread for a community post.
 * Extracted from the community page to reduce its size.
 */
export function CommentThread({
  postId,
  comments,
  loading,
  draft,
  onDraftChange,
  onCommentAdded,
}: CommentThreadProps) {
  async function handleAddComment() {
    const content = draft.trim();
    if (!content) return;
    try {
      const created = await api<Comment>(
        `/api/v1/community/posts/${postId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        },
      );
      onCommentAdded(created);
      toast.success("评论已发布");
    } catch {
      toast.error("评论发布失败");
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-hairline animate-fade-in">
      {/* Add comment */}
      <div className="flex gap-2 mb-4">
        <Input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddComment();
          }}
          placeholder="写下你的评论..."
          className="flex-1"
        />
        <Button
          onClick={handleAddComment}
          disabled={!draft.trim()}
          size="sm"
          icon={Send}
          className="disabled:opacity-50"
        />
      </div>

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="animate-spin text-brand-500" />
        </div>
      ) : (
        <div className="space-y-3">
          {comments.length === 0 ? (
            <p className="text-xs text-muted text-center py-2">
              暂无评论，来抢沙发吧
            </p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-surface-card flex items-center justify-center text-[11px] font-bold text-muted flex-shrink-0">
                  {(comment.user?.name?.[0] || "U").toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">
                      {comment.user?.name || "用户"}
                    </span>
                    <span className="text-[11px] text-muted-soft">
                      {timeAgo(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-[13px] text-body leading-relaxed mt-0.5">
                    {comment.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
