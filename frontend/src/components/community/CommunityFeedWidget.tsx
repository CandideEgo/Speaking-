"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Loader2 } from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Compact community post for the homepage widget. Mirrors the community page
 * Post shape (Phase 1A fixed contract). */
interface FeedPost {
  id: string;
  user: {
    id: string;
    name: string | null;
    avatar_url: string | null;
    level: string | null;
  };
  content: string;
  post_type: string;
  like_count: number;
  comment_count: number;
  created_at: string;
  video?: { id: string; title: string; thumbnail_url: string | null } | null;
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

const AVATAR_COLORS = [
  "bg-gradient-to-br from-brand-500 to-brand-400",
  "bg-gradient-to-br from-indigo-500 to-indigo-400",
  "bg-gradient-to-br from-emerald-500 to-emerald-400",
  "bg-gradient-to-br from-amber-500 to-amber-400",
];
function avatarColor(seed: string | null | undefined): string {
  const s = seed || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * Homepage "社区动态" widget: latest community posts. Falls back to a CTA to
 * the community page when the feed is empty or fails to load. Best-effort —
 * never blocks the homepage (errors swallow to an empty state).
 */
export function CommunityFeedWidget() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ items: FeedPost[]; has_more: boolean }>(
          "/api/v1/community/feed?page=1&page_size=5",
        );
        if (!cancelled) setPosts(data.items || []);
      } catch {
        // non-fatal: widget just shows the CTA
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <div className="sec-head">
        <h2 className="sec-title">社区动态</h2>
        <Link href="/community" className="sec-link">
          查看全部
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-canvas border border-hairline rounded-lg p-6 text-center">
          <p className="text-sm text-muted">社区还没有动态，来发布第一条吧！</p>
          <Link
            href="/community"
            className="btn-primary mt-3 inline-flex text-xs"
          >
            去社区
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {posts.map((p) => (
            <Link
              key={p.id}
              href="/community"
              className="bg-canvas border border-hairline rounded-lg p-4 hover:border-ink hover:shadow-soft transition-all duration-150"
            >
              <div className="flex items-center gap-2 mb-2">
                {p.user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.user.avatar_url}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white",
                      avatarColor(p.user.id),
                    )}
                  >
                    {(p.user.name?.[0] || "U").toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-semibold">
                  {p.user.name || "用户"}
                </span>
                <span className="text-[11px] text-muted ml-auto">
                  {timeAgo(p.created_at)}
                </span>
              </div>
              <p className="text-[13px] text-body line-clamp-2 mb-2">
                {p.content}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <Heart size={12} /> {p.like_count}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle size={12} /> {p.comment_count}
                </span>
                {p.video && (
                  <span className="text-brand-500 truncate">
                    · {p.video.title}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
