"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Milestone } from "@/types";

const SEEN_KEY = "seeword_seen_milestones";

/**
 * 已庆祝过的里程碑类型。localStorage 的内容不可信（历史版本 / 外部改写），
 * 解析失败或结构不对时按「还没庆祝」处理，而不是让调用方崩掉。
 */
function readSeenMilestones(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

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
        const data = await api<Milestone[]>("/api/v1/plan/milestones");
        if (cancelled || !Array.isArray(data)) return;
        const seen = readSeenMilestones();
        const newlyAchieved = data
          .filter((m) => m.achieved_at && !seen.has(m.milestone_type))
          .map((m) => m.milestone_type);
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
      const seen = readSeenMilestones();
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
