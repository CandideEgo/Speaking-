"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Compass, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

interface VocabularyStats {
  total: number;
  due_count: number;
}

/**
 * 首屏右侧的两个次级入口：复习与找视频。
 * 续学/今日任务已经占据主视觉，这里只用小卡片承接「顺手做一件事」。
 */
export function HomeSideActions() {
  return (
    <aside aria-label="其他学习入口" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <ReviewCard />
      <FindVideoCard />
    </aside>
  );
}

function ReviewCard() {
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const [stats, setStats] = useState<VocabularyStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    setFailed(false);
    api<VocabularyStats>("/api/v1/vocabulary/stats", { signal: controller.signal })
      .then((data) => setStats(data))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [authenticated, retry]);

  const due = stats ? Math.max(0, stats.due_count) : null;
  return (
    <section aria-label="词汇复习" className="rounded-md border border-hairline bg-canvas p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-copy font-bold text-ink">
          <BookOpen size={15} className="text-brand-700" aria-hidden />
          词汇复习
        </h2>
        {due !== null && due > 0 && (
          <span className="rounded-pill bg-brand-500/10 px-2 py-0.5 text-caption font-semibold tabular-nums text-brand-700">
            {due} 个到期
          </span>
        )}
      </div>
      {failed ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-meta text-muted">复习安排暂时未能加载</p>
          <Button
            variant="ghost"
            size="compact"
            icon={RefreshCw}
            onClick={() => setRetry((value) => value + 1)}
          >
            重试
          </Button>
        </div>
      ) : !stats ? (
        <div className="mt-3 space-y-2" role="status" aria-label="正在读取词库">
          <div className="h-3 w-28 animate-pulse rounded-pill bg-surface-card" />
          <div className="h-8 w-full animate-pulse rounded-sm bg-surface-card" />
        </div>
      ) : (
        <>
          <p className="mt-2 text-meta leading-relaxed text-body">
            {stats.due_count > 0
              ? `今天到期 ${stats.due_count} 个词，先过 5 个就好。`
              : `今天没有到期词。词库共 ${stats.total} 个词，可以去听一段新的。`}
          </p>
          <LinkButton
            href={stats.due_count > 0 ? "/vocabulary/drill?review_count=5" : "/vocabulary"}
            variant="outline"
            size="sm"
            fullWidth
            className="mt-3"
          >
            {stats.due_count > 0 ? `先复习 ${Math.min(5, stats.due_count)} 个词` : "翻翻我的词库"}
          </LinkButton>
        </>
      )}
    </section>
  );
}

function FindVideoCard() {
  return (
    <section aria-label="找视频" className="rounded-md border border-hairline bg-canvas p-4">
      <h2 className="flex items-center gap-1.5 text-copy font-bold text-ink">
        <Compass size={15} className="text-brand-700" aria-hidden />
        找视频
      </h2>
      <p className="mt-2 text-meta leading-relaxed text-body">
        按主题或难度挑一段，也可以从频道按学习方向找。
      </p>
      <div className="mt-3 flex flex-col">
        <Link
          href="#feed"
          className="flex min-h-9 items-center justify-between gap-2 border-t border-hairline py-2 text-meta font-medium text-body hover:text-ink"
        >
          按主题 / 难度找
          <ChevronRight size={14} aria-hidden />
        </Link>
        <Link
          href="/channels"
          className="flex min-h-9 items-center justify-between gap-2 border-t border-hairline py-2 text-meta font-medium text-body hover:text-ink"
        >
          按频道找
          <ChevronRight size={14} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
