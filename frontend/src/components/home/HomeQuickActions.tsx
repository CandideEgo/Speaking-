"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, CirclePlay, Compass } from "lucide-react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
import type { LearningRecord, Paginated } from "@/types";

/** 三个学习动作集中在标题旁；续播视频与时间放入入口提示。 */
export function HomeQuickActions() {
  return (
    <nav className="home-quick-actions" aria-label="我的学习入口">
      <ContinueAction />
      <ReviewAction />
      <section className="home-quick-item" aria-label="找视频">
        <Link href="#feed">
          <Compass size={17} aria-hidden />
          <span>
            <strong>找视频</strong>
          </span>
        </Link>
      </section>
    </nav>
  );
}

function ContinueAction() {
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const [records, setRecords] = useState<LearningRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    api<Paginated<LearningRecord>>("/api/v1/learning/records?page=1&page_size=6&completed=false", {
      signal: controller.signal,
    })
      .then((data) => {
        setRecords(data.items);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [authenticated, retry]);

  const record = records?.find((item) => !item.completed && item.progress_percentage > 0);
  const position =
    record && Number.isFinite(record.position_seconds) ? record.position_seconds : null;
  return (
    <section
      className="home-quick-item home-quick-continue"
      aria-label="继续上次"
      data-testid={record || failed ? "continue-learning-rail" : undefined}
    >
      {failed ? (
        <div className="home-quick-error" role="status">
          <CirclePlay size={19} aria-hidden />
          <span>
            <strong>接着上次学</strong>
            <small>学习记录暂时未能加载</small>
          </span>
          <Button variant="ghost" size="compact" onClick={() => setRetry((value) => value + 1)}>
            重试
          </Button>
        </div>
      ) : (
        <Link
          href={record ? watchHref(record.video_id, { from: "home" }) : "#home-listening"}
          title={
            record
              ? `${record.video?.title ?? "接着上次学"}${position !== null ? ` · ${formatDuration(position)}` : ""}`
              : undefined
          }
        >
          <CirclePlay size={19} aria-hidden />
          <span>
            <strong>{record ? "接着上次学" : "开始学习"}</strong>
          </span>
        </Link>
      )}
    </section>
  );
}

function ReviewAction() {
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    api<{ due_count: number }>("/api/v1/vocabulary/stats", { signal: controller.signal })
      .then((data) => {
        setDueCount(data.due_count);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [authenticated, retry]);

  const count = dueCount === null ? null : Math.min(5, Math.max(0, dueCount));
  return (
    <section className="home-quick-item" aria-label="词汇复习">
      {failed ? (
        <div className="home-quick-error" role="status">
          <BookOpen size={19} aria-hidden />
          <span>
            <strong>复习我的单词</strong>
            <small>复习安排暂时未能加载</small>
          </span>
          <Button variant="ghost" size="compact" onClick={() => setRetry((value) => value + 1)}>
            重试
          </Button>
        </div>
      ) : (
        <Link href={count && count > 0 ? "/vocabulary/drill?review_count=5" : "/vocabulary"}>
          <BookOpen size={19} aria-hidden />
          <span>
            <strong>{count ? `先复习 ${count} 个词` : "翻翻我的词库"}</strong>
          </span>
        </Link>
      )}
    </section>
  );
}
