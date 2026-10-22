"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, CirclePlay, Dumbbell } from "lucide-react";
import { api } from "@/lib/api";
import { watchHref } from "@/lib/watchEntry";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
import type { ContinueLearningState } from "@/hooks/useContinueLearning";

/**
 * 页头旁的三个紧凑学习入口：继续观看 / 词汇 / 练习。
 *
 * 续播数据由页面已经发起的 `useContinueLearning` 提供，这里不重复请求；入口
 * 只回答「现在点哪里」，不再放「找视频」——分类与频道已经在一屏之内。
 */
export function HomeQuickActions({
  continueLearning,
}: {
  continueLearning: ContinueLearningState;
}) {
  return (
    <nav className="home-quick-actions" aria-label="我的学习入口">
      <ContinueAction state={continueLearning} />
      <ReviewAction />
      <PracticeAction />
    </nav>
  );
}

function ContinueAction({ state }: { state: ContinueLearningState }) {
  const { record, loading, failed, retry } = state;
  const title = record?.video?.title_zh?.trim() || record?.video?.title || "上一段视频";
  const progress = Math.min(100, Math.max(0, Math.round(record?.progress_percentage || 0)));
  const position =
    record && Number.isFinite(record.position_seconds)
      ? Math.max(0, record.position_seconds)
      : null;
  const href = record
    ? watchHref(record.video_id, {
        from: "home",
        extra: position !== null ? { t: Math.floor(position) } : undefined,
      })
    : "#home-listening";

  return (
    <section
      className="home-quick-item home-quick-continue"
      aria-label="继续观看"
      data-testid={record || failed ? "continue-learning-rail" : undefined}
    >
      {failed ? (
        <div className="home-quick-error" role="status">
          <CirclePlay size={19} aria-hidden />
          <span>
            <strong>继续观看</strong>
            <small>学习记录暂时未能加载</small>
          </span>
          <Button variant="ghost" size="compact" onClick={retry}>
            重试
          </Button>
        </div>
      ) : loading ? (
        <div className="home-quick-loading" role="status" aria-label="正在读取学习记录">
          <CirclePlay size={19} aria-hidden />
          <span>
            <strong>继续观看</strong>
            <small>读取进度…</small>
          </span>
        </div>
      ) : (
        <Link href={href} title={record ? `${title} · 已看 ${progress}%` : undefined}>
          <CirclePlay size={19} aria-hidden />
          <span>
            <strong>{record ? "继续观看" : "开始学习"}</strong>
            {record && (
              <small>
                {title} · {progress}%
              </small>
            )}
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
    <section className="home-quick-item home-quick-review" aria-label="词汇">
      {failed ? (
        <div className="home-quick-error" role="status">
          <BookOpen size={19} aria-hidden />
          <span>
            <strong>词汇</strong>
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
            <strong>词汇</strong>
            {count ? <small>{count} 个到期</small> : null}
          </span>
        </Link>
      )}
    </section>
  );
}

function PracticeAction() {
  return (
    <section className="home-quick-item" aria-label="练习">
      <Link href="/practice">
        <Dumbbell size={19} aria-hidden />
        <span>
          <strong>练习</strong>
        </span>
      </Link>
    </section>
  );
}
