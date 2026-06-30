"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2,
  Heart,
  MessageCircle,
  Share2,
  Send,
  Bookmark,
  Play,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toggleVideoLike } from "@/lib/creatorData";

// --- Types ---

interface PostUser {
  id: string;
  name: string | null;
  avatar_url: string | null;
  level: string | null;
}

interface Post {
  id: string;
  user: PostUser;
  content: string;
  post_type: string;
  media_url?: string | null;
  video?: {
    id: string;
    title: string;
    thumbnail_url: string | null;
    duration: number | null;
    difficulty_level: string | null;
    video_url_720p: string | null;
  } | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  is_liked?: boolean;
}

interface PostsResponse {
  items: Post[];
  has_more: boolean;
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

interface CommunityVideo {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration: number | null;
  difficulty_level: string | null;
  like_count: number;
  favorite_count: number;
  user?: PostUser | null;
}

// --- Helpers ---

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

const AVATAR_COLORS = [
  "bg-gradient-to-br from-brand-500 to-brand-400",
  "bg-gradient-to-br from-indigo-500 to-indigo-400",
  "bg-gradient-to-br from-emerald-500 to-emerald-400",
  "bg-gradient-to-br from-amber-500 to-amber-400",
  "bg-gradient-to-br from-rose-500 to-rose-400",
  "bg-gradient-to-br from-sky-500 to-sky-400",
];

function avatarColor(seed: string | null | undefined): string {
  const s = seed || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function userInitial(user: PostUser | undefined | null): string {
  return (user?.name?.[0] || "U").toUpperCase();
}

const POST_TYPE_TAGS: Record<string, { label: string; color: string }> = {
  text: { label: "讨论", color: "bg-brand-50 text-brand-500" },
  progress_share: { label: "学习进展", color: "bg-success-soft text-success" },
  vocabulary_share: { label: "词汇", color: "bg-indigo-soft text-indigo" },
  speaking_share: { label: "口语", color: "bg-warning-soft text-warning" },
  video_share: { label: "视频", color: "bg-sky-soft text-sky" },
};

const TABS = [
  { key: "feed", label: "Feed" },
  { key: "following", label: "Following" },
  { key: "trending", label: "Trending" },
  { key: "videos", label: "视频" },
];

// --- Page ---

export default function CommunityPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState("feed");
  const [posts, setPosts] = useState<Post[]>([]);
  const [communityVideos, setCommunityVideos] = useState<CommunityVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState("");
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<
    Record<string, Comment[]>
  >({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (activeTab === "videos") {
      loadCommunityVideos();
    } else {
      loadPosts();
    }
  }, [activeTab, isLoading, isAuthenticated]);

  async function loadPosts() {
    setLoading(true);
    try {
      // Feed tab: mixed feed (followed + popular).
      // Following tab: same feed endpoint (already prioritizes followed users).
      // Trending tab: feed without type filter (backend sorts by popularity when user has no follows).
      const endpoint = `/api/v1/community/feed?page=1&page_size=20`;
      const data = await api<PostsResponse>(endpoint);
      setPosts(data.items);
    } catch {
      // Show empty state
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadCommunityVideos() {
    setLoading(true);
    try {
      const data = await api<CommunityVideo[]>("/api/v1/community/videos");
      setCommunityVideos(data);
    } catch {
      setCommunityVideos([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleVideoLike(videoId: string) {
    try {
      const res = await toggleVideoLike(videoId);
      setCommunityVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? {
                ...v,
                like_count: res.liked
                  ? v.like_count + 1
                  : Math.max(0, v.like_count - 1),
              }
            : v,
        ),
      );
    } catch {
      toast.error("操作失败");
    }
  }

  async function handleCreatePost() {
    if (!newPost.trim()) return;
    const draft = newPost;
    try {
      await api("/api/v1/community/posts", {
        method: "POST",
        body: JSON.stringify({ content: draft, post_type: "text" }),
      });
      setNewPost("");
      loadPosts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发布失败");
    }
  }

  async function handleLike(postId: string) {
    try {
      const res = await api<{ liked: boolean }>(
        `/api/v1/community/posts/${postId}/like`,
        { method: "POST" },
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                is_liked: res.liked,
                like_count: res.liked
                  ? p.like_count + 1
                  : Math.max(0, p.like_count - 1),
              }
            : p,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function loadComments(postId: string) {
    setCommentLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const data = await api<Comment[]>(
        `/api/v1/community/posts/${postId}/comments`,
      );
      setCommentsByPost((prev) => ({ ...prev, [postId]: data }));
    } catch {
      toast.error("加载评论失败");
    } finally {
      setCommentLoading((prev) => ({ ...prev, [postId]: false }));
    }
  }

  function toggleComments(postId: string) {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
    } else {
      setExpandedPostId(postId);
      if (!commentsByPost[postId]) {
        loadComments(postId);
      }
    }
  }

  async function handleAddComment(postId: string) {
    const content = commentDraft[postId]?.trim();
    if (!content) return;
    try {
      const created = await api<Comment>(
        `/api/v1/community/posts/${postId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        },
      );
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [created, ...(prev[postId] || [])],
      }));
      setCommentDraft((prev) => ({ ...prev, [postId]: "" }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p,
        ),
      );
      toast.success("评论已发布");
    } catch {
      toast.error("评论发布失败");
    }
  }

  async function handleSharePost(post: Post) {
    const url = `${window.location.origin}/community`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${post.user.name ?? "用户"} 的动态`,
          url,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.success("链接已复制到剪贴板");
      }
    } catch {
      // user cancelled
    }
  }

  const currentUserInitial = (user?.name?.[0] || "C").toUpperCase();

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        {/* Page header */}
        <div className="page-head">
          <div className="page-crumb">社区</div>
          <h1 className="page-title">社区精选</h1>
          <p className="page-desc">分享学习心得,发现好内容,和同学一起进步。</p>
        </div>

        {/* Tab bar */}
        <div className="tab-container mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "tab-pill",
                activeTab === tab.key && "tab-pill-active",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Videos tab content */}
        {activeTab === "videos" && (
          <div>
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 size={24} className="animate-spin text-brand-500" />
              </div>
            ) : communityVideos.length === 0 ? (
              <div className="py-20 text-center">
                <Play size={48} className="mx-auto text-muted" />
                <p className="mt-4 text-muted">暂无社区视频</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {communityVideos.map((v) => (
                  <Link
                    key={v.id}
                    href={`/watch/${v.id}`}
                    className="block bg-canvas border border-hairline rounded-lg overflow-hidden hover:border-ink hover:shadow-soft transition-all duration-150"
                  >
                    <div className="relative aspect-video bg-surface-card">
                      {v.thumbnail_url ? (
                        <img
                          src={v.thumbnail_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Play size={24} className="text-muted" />
                        </div>
                      )}
                      {v.difficulty_level && (
                        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/55 text-white">
                          {v.difficulty_level}
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-semibold text-ink truncate">
                        {v.title}
                      </p>
                      {v.user && (
                        <p className="text-xs text-muted mt-1 truncate">
                          {v.user.name}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                        <span className="inline-flex items-center gap-0.5">
                          <Heart size={12} />
                          {v.like_count}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <Bookmark size={12} />
                          {v.favorite_count}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2-column layout (non-videos tabs) */}
        {activeTab !== "videos" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            {/* Posts column */}
            <div>
              {/* Create post */}
              <div className="create-post">
                <div className="flex gap-3 items-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-400 text-on-primary font-bold text-[13px] flex items-center justify-center flex-shrink-0">
                    {currentUserInitial}
                  </div>
                  <textarea
                    placeholder="分享你的学习心得..."
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value)}
                    className="flex-1 border-0 bg-surface-soft rounded-lg px-3.5 py-2.5 text-sm font-sans resize-none h-[42px] text-ink focus:bg-canvas focus:shadow-[0_0_0_2px_rgba(10,10,10,0.06)] focus:outline-none transition-colors"
                  />
                </div>
                <div className="flex justify-between items-center mt-3">
                  <span className="text-xs text-muted-soft">
                    支持添加视频和图片
                  </span>
                  <Button onClick={handleCreatePost} size="sm">
                    发布
                  </Button>
                </div>
              </div>

              {/* Posts list */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-brand-500" />
                </div>
              ) : posts.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="text-muted">还没有帖子，来发布第一条吧！</p>
                </div>
              ) : (
                posts.map((post) => {
                  const tag = POST_TYPE_TAGS[post.post_type];
                  return (
                    <div key={post.id} className="post-card">
                      {/* Author header */}
                      <div className="flex items-center gap-2.5 mb-3">
                        {post.user.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={post.user.avatar_url}
                            alt={post.user.name ?? "用户"}
                            className="w-[38px] h-[38px] rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className={cn(
                              "w-[38px] h-[38px] rounded-full flex items-center justify-center font-bold text-[14px] text-on-primary flex-shrink-0",
                              avatarColor(post.user.id),
                            )}
                          >
                            {userInitial(post.user)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold">
                            {post.user.name ?? "用户"}
                          </div>
                          <div className="text-xs text-muted">
                            {timeAgo(post.created_at)}
                          </div>
                        </div>
                        {tag && (
                          <span
                            className={cn(
                              "text-[11px] font-bold px-2.5 py-1 rounded-pill",
                              tag.color,
                            )}
                          >
                            {tag.label}
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <p className="text-sm text-body leading-relaxed mb-3.5">
                        {post.content}
                      </p>

                      {/* Video preview */}
                      {post.video && (
                        <Link
                          href={`/watch/${post.video.id}`}
                          className="flex gap-3 items-center bg-surface-soft border border-hairline rounded-lg px-3 py-3 mb-3.5 hover:bg-canvas hover:border-ink transition-colors"
                        >
                          <div className="w-[84px] h-[48px] rounded-lg bg-ink flex-shrink-0 relative overflow-hidden">
                            <div
                              className="absolute inset-0"
                              style={{
                                background:
                                  "radial-gradient(80% 80% at 60% 40%, rgba(255,90,31,0.4), transparent)",
                              }}
                            />
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold leading-snug">
                              {post.video.title || "视频"}
                            </div>
                            <div className="text-[11px] text-muted mt-[3px]">
                              {post.video.difficulty_level || "B2"}
                            </div>
                          </div>
                        </Link>
                      )}

                      {/* Actions */}
                      <div className="flex gap-[18px]">
                        <button
                          onClick={() => handleLike(post.id)}
                          className={cn(
                            "flex items-center gap-1.5 text-[13px] font-semibold cursor-pointer transition-colors",
                            post.is_liked
                              ? "text-brand-500"
                              : "text-muted hover:text-ink",
                          )}
                        >
                          <Heart
                            size={16}
                            className={post.is_liked ? "fill-brand-500" : ""}
                          />
                          {post.like_count}
                        </button>
                        <button
                          onClick={() => toggleComments(post.id)}
                          className={cn(
                            "flex items-center gap-1.5 text-[13px] font-semibold cursor-pointer transition-colors",
                            expandedPostId === post.id
                              ? "text-brand-500"
                              : "text-muted hover:text-ink",
                          )}
                        >
                          <MessageCircle size={16} />
                          {post.comment_count}
                        </button>
                        <button
                          onClick={() => handleSharePost(post)}
                          className="flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink cursor-pointer transition-colors"
                        >
                          <Share2 size={16} />
                          分享
                        </button>
                      </div>

                      {/* Comments section */}
                      {expandedPostId === post.id && (
                        <div className="mt-4 pt-4 border-t border-hairline animate-fade-in">
                          {/* Add comment */}
                          <div className="flex gap-2 mb-4">
                            <Input
                              type="text"
                              value={commentDraft[post.id] || ""}
                              onChange={(e) =>
                                setCommentDraft((prev) => ({
                                  ...prev,
                                  [post.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleAddComment(post.id);
                              }}
                              placeholder="写下你的评论..."
                              className="flex-1"
                            />
                            <Button
                              onClick={() => handleAddComment(post.id)}
                              disabled={!commentDraft[post.id]?.trim()}
                              size="sm"
                              icon={Send}
                              className="disabled:opacity-50"
                            />
                          </div>

                          {/* Comments list */}
                          {commentLoading[post.id] ? (
                            <div className="flex justify-center py-4">
                              <Loader2
                                size={20}
                                className="animate-spin text-brand-500"
                              />
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {(commentsByPost[post.id] || []).length === 0 ? (
                                <p className="text-xs text-muted text-center py-2">
                                  暂无评论，来抢沙发吧
                                </p>
                              ) : (
                                (commentsByPost[post.id] || []).map(
                                  (comment) => (
                                    <div
                                      key={comment.id}
                                      className="flex gap-2.5"
                                    >
                                      <div className="w-7 h-7 rounded-full bg-surface-card flex items-center justify-center text-[11px] font-bold text-muted flex-shrink-0">
                                        {(
                                          comment.user?.name?.[0] || "U"
                                        ).toUpperCase()}
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
                                  ),
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar */}
            <div className="side-panel hidden lg:block">
              <div className="side-card">
                <h4 className="!text-[13px] !font-bold uppercase tracking-[0.02em] text-muted !m-0 !mb-3.5">
                  社区指南
                </h4>
                <ul className="space-y-2 text-[13px] text-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-brand-500">·</span>
                    <span>分享学习心得、口语技巧或好视频</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-500">·</span>
                    <span>给感兴趣的帖子点赞、评论</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-500">·</span>
                    <span>友善交流，共同进步</span>
                  </li>
                </ul>
              </div>

              <div className="side-card">
                <h4 className="!text-[13px] !font-bold uppercase tracking-[0.02em] text-muted !m-0 !mb-3.5">
                  热门话题
                </h4>
                <p className="text-[13px] text-muted">
                  话题榜即将上线，敬请期待。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
