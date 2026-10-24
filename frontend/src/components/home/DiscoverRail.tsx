"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CirclePlay, Flame } from "lucide-react";

import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";
import { VideoMetadata } from "@/components/video/VideoMetadata";
import { formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import type { VideoCard } from "@/types";
import type { ChannelSubscriptionSummary } from "@/types/channels";

interface ContinueItem {
  video: VideoCard;
  position_seconds: number;
  progress_percentage: number;
  remaining_seconds: number | null;
}

interface ContinueResponse {
  items: ContinueItem[];
  total: number;
}

/** Compact resume strip: cover, title, remaining time, explicit continue. */
export function DiscoverContinue() {
  const [item, setItem] = useState<ContinueItem | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    api<ContinueResponse>("/api/v1/learning/continue?limit=1", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setItem(data.items[0] ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);

  if (failed) {
    return (
      <p role="status" className="mb-4 flex items-center gap-2 text-meta text-muted">
        观看记录暂时未能加载
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="font-medium text-brand-700 hover:underline"
        >
          重试
        </button>
      </p>
    );
  }
  if (!item) return null;
  const { video } = item;
  const progress = Math.max(0, Math.min(100, Math.round(item.progress_percentage)));
  const remaining = item.remaining_seconds;

  return (
    <Link
      href={watchHref(video.id, {
        from: "home",
        extra: { t: Math.floor(item.position_seconds) },
      })}
      className="group mb-4 flex items-center gap-3 rounded-md border border-hairline bg-canvas p-2.5 transition-colors hover:border-hairline-strong"
      data-testid="continue-learning-rail"
    >
      <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-sm bg-surface-card">
        <Image src={video.thumbnail_url} alt="" sizes="96px" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-caption font-semibold text-brand-700">
          <CirclePlay size={13} aria-hidden /> 继续观看 · {progress}%
        </span>
        <span className="mt-0.5 block truncate text-copy font-semibold text-ink">
          {video.title_zh?.trim() || video.title}
        </span>
        <span className="mt-0.5 block truncate text-meta text-muted">
          {video.title}
          {remaining != null && remaining > 0 ? ` · 还剩 ${formatDuration(remaining)}` : ""}
        </span>
        <VideoMetadata video={video} className="mt-1" />
        <span className="mt-1.5 block h-[3px] overflow-hidden rounded-pill bg-surface-card">
          <span
            className="block h-full rounded-pill bg-brand-500"
            style={{ width: `${progress}%` }}
          />
        </span>
      </div>
      <span className="shrink-0 rounded-pill border border-hairline px-3 py-1.5 text-meta font-semibold text-ink group-hover:border-hairline-strong">
        继续
      </span>
    </Link>
  );
}

interface Overview {
  streak: { current: number };
  this_week: {
    minutes: number;
    days_active: number;
    daily: { date: string; minutes: number; active?: boolean }[];
  };
  words: { total: number; due_review_count: number };
}

/** Right rail: due words, subscribed channels, and the week's real activity. */
export function DiscoverRail({ initialDue = 0 }: { initialDue?: number }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [subs, setSubs] = useState<ChannelSubscriptionSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api<Overview>("/api/v1/users/me/overview", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setOverview(data);
      })
      .catch(() => {});
    api<ChannelSubscriptionSummary[] | { items: ChannelSubscriptionSummary[] }>(
      "/api/v1/discovery/subscriptions",
      { signal: controller.signal }
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setSubs(Array.isArray(data) ? data : (data.items ?? []));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const due = overview?.words?.due_review_count ?? initialDue;
  const week = overview?.this_week;

  return (
    <aside className="flex flex-col gap-3" aria-label="今天的进度">
      <section className="rounded-lg bg-surface-dark p-4 text-on-dark">
        <p className="text-caption font-semibold tracking-[0.08em] text-on-dark-soft">今天复习</p>
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[2.75rem] font-semibold leading-none tracking-tight">{due}</span>
          <span className="text-meta text-on-dark-soft">个到期</span>
        </p>
        <p className="mt-2 text-meta text-on-dark-soft">
          {due > 0 ? "先处理到期的词，约 2 分钟。" : "今天的到期词已经清空。"}
        </p>
        <div className="mt-3 flex gap-2">
          <Link
            href="/vocabulary/review"
            className="rounded-pill bg-canvas px-3 py-1.5 text-meta font-semibold text-ink"
          >
            {due > 0 ? "开始复习" : "看全部词汇"}
          </Link>
          <Link
            href="/vocabulary"
            className="rounded-pill border border-on-dark/25 px-3 py-1.5 text-meta text-on-dark"
          >
            全部 {overview?.words?.total ?? 0}
          </Link>
        </div>
      </section>

      <section className="rounded-md border border-hairline bg-canvas p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-copy font-semibold text-ink">正在学</h2>
          <Link href="/channels" className="text-meta text-brand-700 hover:underline">
            全部
          </Link>
        </div>
        {subs.length === 0 ? (
          <p className="mt-2 text-meta text-muted">
            还没有订阅频道。
            <Link href="/channels" className="ml-1 text-brand-700 hover:underline">
              去挑一个
            </Link>
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {subs.slice(0, 3).map((channel) => (
              <li key={channel.id}>
                <Link
                  href={`/channels/${channel.slug}`}
                  className="flex items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface-soft"
                >
                  <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-pill bg-surface-card">
                    <Image src={channel.cover_url} alt="" sizes="28px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-meta font-medium text-ink">
                      {channel.name}
                    </span>
                    <span className="block truncate text-caption text-muted">
                      {channel.unlearned_count ?? 0} 段未学
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-hairline bg-canvas p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-copy font-semibold text-ink">本周节奏</h2>
          <span className="text-caption text-muted">记录</span>
        </div>
        <dl className="mt-2 space-y-1 text-meta">
          <div className="flex justify-between">
            <dt className="text-muted">有学习的天数</dt>
            <dd className="tabular-nums text-ink">{week ? `${week.days_active} / 7 天` : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">累计学习</dt>
            <dd className="tabular-nums text-ink">{week ? `${week.minutes} 分钟` : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">连续学习</dt>
            <dd className="flex items-center gap-1 tabular-nums text-ink">
              <Flame size={12} className="text-brand-500" aria-hidden />
              {overview?.streak ? `${overview.streak.current} 天` : "—"}
            </dd>
          </div>
        </dl>
        <div className="mt-2 flex gap-1">
          {(
            week?.daily ??
            Array.from({ length: 7 }, () => ({ date: "", minutes: 0, active: false }))
          ).map((day, index) => (
            <span
              key={`${day.date}-${index}`}
              title={day.date ? `${day.date} · ${day.minutes} 分钟` : undefined}
              className={`h-1.5 flex-1 rounded-pill ${(day.active ?? day.minutes > 0) ? "bg-brand-500" : "bg-surface-card"}`}
            />
          ))}
        </div>
        <p className="mt-2 text-caption text-muted">只记录发生过的学习；没有任务打卡，也不补记。</p>
      </section>

      <Link
        href="/history"
        className="flex items-center justify-between rounded-md border border-hairline px-3.5 py-2.5 text-meta text-body hover:bg-surface-soft"
      >
        查看学习记录
        <ArrowRight size={14} className="text-muted" aria-hidden />
      </Link>
    </aside>
  );
}
