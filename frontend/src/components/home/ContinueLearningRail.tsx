"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import { useAuthStore } from "@/stores/authStore";
import { Card } from "@/components/ui/Card";
import { Image } from "@/components/ui/Image";
import type { LearningRecord, Paginated } from "@/types";

/**
 * DEC-080 · 首页「继续学习」rail。
 *
 * 数据复用 `/learning/records`：接口已按 `last_accessed_at DESC` 排序并下发
 * `progress_percentage`。这里只保留「未完成且进度 > 0」的记录，最多 4 条；
 * 空数据、接口失败、未登录都整块不渲染 —— 首页不能因为一条个性化 rail 把
 * 推荐网格挤掉或留一个空盒子。
 */
const MAX_ITEMS = 4;
const PAGE_SIZE = 6;

export function pickContinueLearning(
  records: LearningRecord[] | null | undefined
): LearningRecord[] {
  if (!records?.length) return [];
  return records.filter((r) => !r.completed && r.progress_percentage > 0).slice(0, MAX_ITEMS);
}

export function ContinueLearningRail() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [records, setRecords] = useState<LearningRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setRecords(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<Paginated<LearningRecord>>(
      `/api/v1/learning/records?page=1&page_size=${PAGE_SIZE}&completed=false`
    )
      .then((data) => {
        if (!cancelled) setRecords(pickContinueLearning(data.items));
      })
      .catch(() => {
        // 个性化 rail 失败不影响首页：静默隐藏。
        if (!cancelled) setRecords([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  if (loading && !records) {
    return (
      <section className="mb-7" data-testid="continue-learning-rail">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-title font-bold text-ink">继续学习</h2>
          <Link
            href="/history"
            className="text-copy font-semibold text-muted transition-colors hover:text-ink"
          >
            查看全部 →
          </Link>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card
              key={i}
              padding={0}
              className="w-[240px] shrink-0 animate-pulse overflow-hidden sm:w-[280px]"
            >
              <div className="aspect-video bg-surface-card" />
              <div className="space-y-2.5 p-3.5">
                <div className="h-4 w-3/4 rounded-md bg-surface-card" />
                <div className="h-1.5 rounded-full bg-surface-card" />
              </div>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  const visible = records ?? [];
  if (!visible.length) return null;

  return (
    <section className="mb-7" data-testid="continue-learning-rail">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-title font-bold text-ink">继续学习</h2>
        <Link
          href="/history"
          className="text-copy font-semibold text-muted transition-colors hover:text-ink"
        >
          查看全部 →
        </Link>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
        {visible.map((record) => (
          <ContinueLearningCard key={record.id} record={record} />
        ))}
      </div>
    </section>
  );
}

function ContinueLearningCard({ record }: { record: LearningRecord }) {
  const progress = Math.max(0, Math.min(100, Math.round(record.progress_percentage)));
  return (
    <Card
      as={Link}
      href={watchHref(record.video_id, { from: "home" })}
      padding={0}
      className="group w-[240px] shrink-0 snap-start overflow-hidden transition-all hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-lift sm:w-[280px]"
    >
      <div className="relative aspect-video overflow-hidden bg-surface-card">
        <Image
          src={record.video?.thumbnail_url}
          alt=""
          fill
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <PlayCircle size={28} className="text-muted-soft" />
            </div>
          }
        />
        <span className="absolute bottom-2 right-2 rounded-sm bg-ink/80 px-1.5 py-0.5 text-caption font-semibold text-canvas font-mono">
          {progress}%
        </span>
      </div>
      <div className="p-3.5">
        <p className="line-clamp-2 text-copy font-semibold leading-snug text-ink transition-colors group-hover:text-brand-600">
          {record.video?.title || "未知视频"}
        </p>
        <div className="mt-2.5 h-1.5 rounded-full bg-surface-card">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-meta text-muted">
          <span className="inline-flex items-center gap-1">
            <PlayCircle size={13} />
            续播
          </span>
          {record.video?.duration ? (
            <span className="font-mono">{formatDuration(record.video.duration)}</span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
