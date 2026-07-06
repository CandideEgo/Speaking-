import { create } from "zustand";
import type { Video } from "@/types";

/**
 * P2 home feed store (ADR-0011). Caches the recommendation feed across
 * components/mounts and tracks which videos the user has opened (seen) for
 * soft de-prioritization — seen videos sink to the back of the "为你推荐"
 * rail rather than being hidden (the pool is too small to drop content).
 *
 * `seenIds` persists to localStorage so it survives reloads; `feed` is
 * session-only (re-fetched by useHomeFeed on mount).
 */

const SEEN_KEY = "feed:seen";
const MAX_SEEN = 50;

function loadSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

interface FeedStore {
  /** Raw recommendation feed (page 1). Set by useHomeFeed on fetch. */
  feed: Video[];
  setFeed: (feed: Video[]) => void;
  /** Recently-opened video ids, most-recent-first. Persisted to localStorage. */
  seenIds: string[];
  markSeen: (id: string) => void;
}

export const useFeedStore = create<FeedStore>((set) => ({
  feed: [],
  setFeed: (feed) => set({ feed }),
  seenIds: loadSeen(),
  markSeen: (id) =>
    set((s) => {
      if (!id || s.seenIds.includes(id)) return s;
      const next = [id, ...s.seenIds].slice(0, MAX_SEEN);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
        } catch {
          // localStorage unavailable / quota — keep in-memory only.
        }
      }
      return { seenIds: next };
    }),
}));

/**
 * Soft de-prioritize seen videos: unseen first (in feed order), seen last
 * (in feed order). Does NOT drop any video — the pool is small, hiding
 * content would empty the rail.
 */
export function recommendWithSeenSink(
  feed: Video[],
  seenIds: string[],
): Video[] {
  if (seenIds.length === 0) return feed;
  const seen = new Set(seenIds);
  const unseen: Video[] = [];
  const seenList: Video[] = [];
  for (const v of feed) {
    (seen.has(v.id) ? seenList : unseen).push(v);
  }
  return [...unseen, ...seenList];
}
