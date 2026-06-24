"use client";

import { cn } from "@/lib/utils";
import { Heart, MessageCircle, Flag } from "lucide-react";
import type { Post, PostType } from "@/types";

interface PostCardProps {
  post: Post;
  onLike: (postId: string) => void;
  onUnlike: (postId: string) => void;
  onClick?: (postId: string) => void;
}

const POST_TYPE_CONFIG: Record<PostType, { label: string; color: string }> = {
  text: { label: "Text", color: "bg-slate-500/20 text-slate-400" },
  progress: { label: "Progress", color: "bg-green-500/20 text-green-400" },
  vocabulary: { label: "Vocabulary", color: "bg-blue-500/20 text-blue-400" },
  speaking: { label: "Speaking", color: "bg-coral/20 text-coral" },
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function PostCard({ post, onLike, onUnlike, onClick }: PostCardProps) {
  const typeConfig = POST_TYPE_CONFIG[post.post_type];

  function handleLike() {
    post.is_liked ? onUnlike(post.id) : onLike(post.id);
  }

  return (
    <article
      onClick={() => onClick?.(post.id)}
      className={cn(
        "rounded-lg border border-hairline bg-canvas p-4 transition-all",
        "hover:border-coral/30 hover:shadow-sm",
        onClick && "cursor-pointer"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-coral/10 text-sm font-semibold text-coral">
          {post.user_avatar_url ? (
            <img
              src={post.user_avatar_url}
              alt={post.user_name}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            (post.user_name || "U").charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink truncate">{post.user_name}</span>
            {post.user_level && (
              <span className="shrink-0 rounded-sm bg-cream-soft px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {post.user_level}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            typeConfig.color
          )}
        >
          {typeConfig.label}
        </span>
      </div>

      {/* Content */}
      <p className="mt-3 text-sm leading-relaxed text-ink/80 whitespace-pre-wrap line-clamp-6">
        {post.content}
      </p>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-4 border-t border-hairline pt-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleLike();
          }}
          className={cn(
            "flex items-center gap-1.5 text-xs transition-colors",
            post.is_liked ? "text-red-500" : "text-muted-foreground hover:text-red-400"
          )}
        >
          <Heart size={14} fill={post.is_liked ? "currentColor" : "none"} />
          <span>{post.like_count}</span>
        </button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircle size={14} />
          <span>{post.comment_count}</span>
        </div>
      </div>
    </article>
  );
}
