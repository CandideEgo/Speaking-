"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Heart, Reply, Flag, Send, X } from "lucide-react";
import type { UserComment } from "@/types";

interface CommentThreadProps {
  comments: UserComment[];
  onLike: (commentId: string) => void;
  onReply: (postId: string, content: string, parentId?: string) => void;
  onReport?: (commentId: string) => void;
  postId: string;
}

function CommentItem({
  comment,
  depth,
  postId,
  onLike,
  onReply,
  onReport,
}: {
  comment: UserComment;
  depth: number;
  postId: string;
  onLike: (id: string) => void;
  onReply: (postId: string, content: string, parentId?: string) => void;
  onReport?: (id: string) => void;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showReport, setShowReport] = useState(false);

  async function handleSubmitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    await onReply(postId, replyText.trim(), comment.id);
    setReplyText("");
    setShowReplyForm(false);
  }

  return (
    <div className={cn(depth > 0 && "ml-6 border-l border-hairline pl-4")}>
      <div className="flex items-start gap-3 py-3">
        {/* Avatar */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral/10 text-[10px] font-semibold text-coral">
          {comment.user_avatar_url ? (
            <img
              src={comment.user_avatar_url}
              alt={comment.user_name}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            (comment.user_name || "U").charAt(0).toUpperCase()
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink">{comment.user_name}</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(comment.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink/80 whitespace-pre-wrap">{comment.content}</p>

          {/* Actions */}
          <div className="mt-1.5 flex items-center gap-3">
            <button
              onClick={() => onLike(comment.id)}
              className={cn(
                "flex items-center gap-1 text-[10px] transition-colors",
                comment.is_liked ? "text-red-500" : "text-muted-foreground hover:text-red-400"
              )}
            >
              <Heart size={11} fill={comment.is_liked ? "currentColor" : "none"} />
              {comment.like_count > 0 && comment.like_count}
            </button>
            <button
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-ink"
            >
              <Reply size={11} /> Reply
            </button>
            <button
              onClick={() => setShowReport(!showReport)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-ink"
            >
              <Flag size={11} /> Report
            </button>
          </div>

          {/* Inline reply form */}
          {showReplyForm && (
            <form onSubmit={handleSubmitReply} className="mt-2 flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                autoFocus
                className="flex-1 rounded-md border border-hairline bg-white px-2.5 py-1.5 text-xs text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20"
              />
              <button
                type="submit"
                disabled={!replyText.trim()}
                className="rounded-md bg-coral px-2.5 py-1.5 text-white disabled:opacity-50"
              >
                <Send size={12} />
              </button>
              <button
                type="button"
                onClick={() => setShowReplyForm(false)}
                className="text-muted-foreground hover:text-ink"
              >
                <X size={14} />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply: UserComment) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              postId={postId}
              onLike={onLike}
              onReply={onReply}
              onReport={onReport}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({
  comments,
  onLike,
  onReply,
  onReport,
  postId,
}: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">No comments yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-hairline">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          depth={0}
          postId={postId}
          onLike={onLike}
          onReply={onReply}
          onReport={onReport}
        />
      ))}
    </div>
  );
}
