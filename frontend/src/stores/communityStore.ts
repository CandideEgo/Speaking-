import { create } from "zustand";
import { api } from "@/lib/api";
import type { Post, PostType, UserComment } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────

interface CommunityState {
  posts: Post[];
  isLoading: boolean;
  hasMore: boolean;
  activeTab: "feed" | "following" | "trending";
  filterType: PostType | "all";
  isCreating: boolean;
  error: string | null;
}

interface CommunityActions {
  fetchPosts: (reset?: boolean) => Promise<void>;
  createPost: (content: string, postType?: PostType) => Promise<void>;
  likePost: (postId: string) => Promise<void>;
  unlikePost: (postId: string) => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  setFilterType: (type: PostType | "all") => void;
  setActiveTab: (tab: "feed" | "following" | "trending") => void;
  fetchComments: (postId: string) => Promise<UserComment[]>;
  addComment: (postId: string, content: string, parentId?: string) => Promise<void>;
  likeComment: (commentId: string) => Promise<void>;
}

type CommunityStore = CommunityState & CommunityActions;

// ── Store ────────────────────────────────────────────────────────────────

export const useCommunityStore = create<CommunityStore>((set, get) => ({
  posts: [],
  isLoading: false,
  hasMore: true,
  activeTab: "feed",
  filterType: "all",
  isCreating: false,
  error: null,

  async fetchPosts(reset = false) {
    const state = get();
    if (state.isLoading) return;

    set({ isLoading: true, error: null });
    try {
      const offset = reset ? 0 : state.posts.length;
      const limit = 20;
      const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
      if (state.filterType !== "all") {
        params.set("post_type", state.filterType);
      }

      const data = await api<{ items: Post[]; total: number }>(
        `/api/v1/community/posts?${params.toString()}`
      );

      set({
        posts: reset ? data.items : [...state.posts, ...data.items],
        hasMore: data.items.length >= limit,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load posts",
        isLoading: false,
      });
    }
  },

  async createPost(content: string, postType: PostType = "text") {
    set({ isCreating: true, error: null });
    try {
      const post = await api<Post>("/api/v1/community/posts", {
        method: "POST",
        body: JSON.stringify({ content, post_type: postType }),
      });
      set((s) => ({
        posts: [post, ...s.posts],
        isCreating: false,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to create post",
        isCreating: false,
      });
      throw err;
    }
  },

  async likePost(postId: string) {
    try {
      await api(`/api/v1/community/posts/${postId}/like`, { method: "POST" });
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === postId ? { ...p, is_liked: true, like_count: p.like_count + 1 } : p
        ),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to like" });
    }
  },

  async unlikePost(postId: string) {
    try {
      await api(`/api/v1/community/posts/${postId}/like`, { method: "DELETE" });
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === postId ? { ...p, is_liked: false, like_count: Math.max(0, p.like_count - 1) } : p
        ),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to unlike" });
    }
  },

  async toggleLike(postId: string) {
    const post = get().posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.is_liked) {
      await get().unlikePost(postId);
    } else {
      await get().likePost(postId);
    }
  },

  setFilterType(type: PostType | "all") {
    set({ filterType: type });
    get().fetchPosts(true);
  },

  setActiveTab(tab: "feed" | "following" | "trending") {
    set({ activeTab: tab });
  },

  async fetchComments(postId: string): Promise<UserComment[]> {
    try {
      const data = await api<UserComment[]>(`/api/v1/community/posts/${postId}/comments`);
      return data;
    } catch {
      return [];
    }
  },

  async addComment(postId: string, content: string, parentId?: string) {
    try {
      await api(`/api/v1/community/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content, parent_id: parentId ?? null }),
      });
      // Increment comment count optimistically
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p
        ),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to add comment" });
    }
  },

  async likeComment(commentId: string) {
    try {
      await api(`/api/v1/community/comments/${commentId}/like`, {
        method: "POST",
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to like comment" });
    }
  },
}));
