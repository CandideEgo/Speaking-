"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const SEEN_KEY = "seeword_seen_milestones";

/**
 * D5 confetti trigger. Fetches the user's current milestone state from
 * /plan/milestones, diffs against localStorage to find newly achieved
 * ones, and surfaces them one-at-a-time via `current`.
 */
export function useMilestoneCelebration() {
  const [queue, setQueue] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ milestones?: { key: string; achieved: boolean }[] }>(
          "/api/v1/plan/milestones"
        );
        if (cancelled || !data?.milestones) return;
        const seenRaw = window.localStorage.getItem(SEEN_KEY);
        const seen = new Set<string>(seenRaw ? (JSON.parse(seenRaw) as string[]) : []);
        const newlyAchieved = data.milestones
          .filter((m) => m.achieved && !seen.has(m.key))
          .map((m) => m.key);
        if (newlyAchieved.length) {
          setQueue(newlyAchieved);
        }
      } catch {
        // non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function acknowledge(milestone: string) {
    if (typeof window !== "undefined") {
      const seenRaw = window.localStorage.getItem(SEEN_KEY);
      const seen = new Set<string>(seenRaw ? (JSON.parse(seenRaw) as string[]) : []);
      seen.add(milestone);
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));
    }
    setCurrent(null);
    setQueue((q) => q.slice(1));
  }

  useEffect(() => {
    if (current === null && queue.length > 0) {
      setCurrent(queue[0]);
    }
  }, [current, queue]);

  return {
    current,
    acknowledge,
  };
}
