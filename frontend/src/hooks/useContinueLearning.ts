"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { LearningRecord, Paginated } from "@/types";

/** 「继续学习」只认最近一条未完成且真的看过的记录。 */
export interface ContinueLearningState {
  record: LearningRecord | null;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}

export function useContinueLearning(): ContinueLearningState {
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const [record, setRecord] = useState<LearningRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!authenticated) {
      setRecord(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    api<Paginated<LearningRecord>>("/api/v1/learning/records?page=1&page_size=6&completed=false", {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRecord(
          data.items.find((item) => !item.completed && (item.progress_percentage || 0) > 0) ?? null
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setRecord(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authenticated, attempt]);

  return { record, loading, failed, retry };
}
