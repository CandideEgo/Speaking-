"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";
import { ChannelStartCard, type ChannelStartBasis } from "@/components/channels/ChannelStartCard";
import { ChannelSubscribeButton } from "@/components/channels/ChannelSubscribeButton";
import { ChannelVideoRow } from "@/components/channels/ChannelVideoRow";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageTransition } from "@/components/common/PageTransition";
import { Button } from "@/components/ui/Button";
import { Image } from "@/components/ui/Image";
import { LinkButton } from "@/components/ui/LinkButton";
import { PageHeader } from "@/components/ui/PageHeader";
import type { VideoCardData } from "@/components/ui/VideoCard";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { api, ApiError } from "@/lib/api";
import { userInitial } from "@/lib/avatar";
import {
  directionLabels,
  formatCollectedVideos,
  formatDifficultyRange,
} from "@/lib/channelLearning";
import { formatViews } from "@/lib/format";
import { scrollKey } from "@/lib/scrollMemory";
import type { ChannelDifficultyRange, ChannelSummary } from "@/types/channels";

const PAGE_SIZE = 20;
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

interface ChannelVideoCard extends VideoCardData {
  channel_name?: string | null;
}

interface ChannelRecommendedStart {
  video: ChannelVideoCard;
  basis: ChannelStartBasis;
}

interface ChannelDetailResponse {
  channel: ChannelSummary;
  videos: {
    items: ChannelVideoCard[];
    page: number;
    page_size: number;
    total: number;
    has_more?: boolean;
  };
  /** 新增字段：后端未升级/无可用依据时为 null（页面退化到「最近收录」）。 */
  recommended_start?: ChannelRecommendedStart | null;
}

function idOf(video: { id?: string; video_id?: string } | null | undefined): string {
  return String(video?.id || video?.video_id || "");
}

/**
 * 服务端没下发 difficulty_range 时的兜底：只有在「已加载完全部视频」后才自行
 * 推导，否则会把分页外的视频漏算成一个假区间（宁可省略，也不能写错难度）。
 */
function deriveDifficultyRange(
  videos: ChannelVideoCard[],
  total: number
): ChannelDifficultyRange | null {
  if (!videos.length || videos.length < total) return null;
  const indexes = videos
    .map((video) => (video.difficulty_level ? CEFR_ORDER.indexOf(video.difficulty_level) : -1))
    .filter((index) => index >= 0);
  if (!indexes.length) return null;
  return { min: CEFR_ORDER[Math.min(...indexes)], max: CEFR_ORDER[Math.max(...indexes)] };
}

/** 页头事实行里的小分隔点。手机上只靠间距分组：390px 一行放不下，
 *  换行时圆点会孤零零地落到行首（`· 原平台粉丝…`），比没有更碍读。 */
function FactSeparator() {
  return (
    <span aria-hidden className="hidden text-muted-soft sm:inline">
      ·
    </span>
  );
}

/** 加载占位：结构与真实页头/推荐卡/列表一致，避免先闪错误或空态。 */
function ChannelDetailSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true">
      <span className="sr-only">正在加载频道…</span>
      <div className="mb-4 h-3 w-24 rounded-sm bg-surface-card" />
      <div className="flex flex-wrap items-center gap-4 border-b border-hairline pb-5">
        <div className="size-14 rounded-pill bg-surface-card sm:size-16" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="h-6 w-2/3 max-w-sm rounded-sm bg-surface-card" />
          <div className="h-4 w-1/2 max-w-xs rounded-sm bg-surface-card" />
          <div className="h-3 w-2/3 max-w-md rounded-sm bg-surface-card" />
        </div>
        <div className="h-10 w-28 rounded-sm bg-surface-card" />
      </div>
      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <div className="h-44 rounded-md bg-surface-card" />
          <div className="h-4 w-32 rounded-sm bg-surface-card" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 py-2">
              <div className="aspect-video w-28 shrink-0 rounded-sm bg-surface-card sm:w-36" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <div className="h-4 w-3/4 rounded-sm bg-surface-card" />
                <div className="h-3 w-1/3 rounded-sm bg-surface-card" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden flex-col gap-5 xl:flex">
          <div className="h-28 rounded-md bg-surface-card" />
          <div className="h-24 rounded-md bg-surface-card" />
        </div>
      </div>
    </div>
  );
}

export default function ChannelDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [channel, setChannel] = useState<ChannelSummary | null>(null);
  const [videos, setVideos] = useState<ChannelVideoCard[]>([]);
  const [recommended, setRecommended] = useState<ChannelRecommendedStart | null>(null);
  const [related, setRelated] = useState<ChannelSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setError(null);
        setErrorStatus(null);
      }
      setLoadMoreError(null);
      try {
        const data = await api<ChannelDetailResponse>(
          `/api/v1/channels/${encodeURIComponent(slug)}?page=${targetPage}&page_size=${PAGE_SIZE}`
        );
        if (!data?.channel || !data.videos) throw new Error("频道数据异常");
        setChannel(data.channel);
        setTotal(data.videos.total);
        setPage(targetPage);
        const mapped = data.videos.items.map((video) => ({
          ...video,
          channel_title: video.channel_title ?? video.channel_name ?? undefined,
        }));
        if (append) {
          setVideos((prev) => {
            const seen = new Set(prev.map(idOf));
            const fresh = mapped.filter((video) => {
              const key = idOf(video);
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            return [...prev, ...fresh];
          });
        } else {
          setVideos(mapped);
          setRecommended(data.recommended_start ?? null);
        }
        const more =
          data.videos.has_more ?? data.videos.page * data.videos.page_size < data.videos.total;
        setHasMore(Boolean(more) && data.videos.items.length > 0);
      } catch (e) {
        const message = e instanceof Error ? e.message : "加载失败";
        if (append) {
          setLoadMoreError(message);
        } else {
          setError(message);
          setErrorStatus(e instanceof ApiError ? e.status : null);
        }
      } finally {
        setLoadingMore(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    if (!slug) return;
    // 换频道时先清掉旧频道的数据，避免新 URL 先渲染上一个频道的页头与列表。
    setChannel(null);
    setVideos([]);
    setRecommended(null);
    setRelated([]);
    setTotal(0);
    setPage(1);
    setHasMore(false);
    setError(null);
    setErrorStatus(null);
    load(1, false);
  }, [slug, load]);

  // 相关频道：同列表接口，取前几个、排除当前频道（失败就整段隐藏）。
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    api<{ items: ChannelSummary[] }>("/api/v1/channels?page_size=6", {
      signal: controller.signal,
    })
      .then((data) => setRelated(data.items.filter((item) => item.slug !== slug).slice(0, 3)))
      .catch(() => setRelated([]));
    return () => controller.abort();
  }, [slug]);

  const mergedVideos = videos;

  const directionChips = useMemo(() => directionLabels(channel?.learning_directions), [channel]);

  const difficultyText = useMemo(() => {
    if (!channel) return null;
    return (
      formatDifficultyRange(channel.difficulty_range) ??
      formatDifficultyRange(deriveDifficultyRange(mergedVideos, total))
    );
  }, [channel, mergedVideos, total]);

  /**
   * 页首「先学这段」：优先用服务端 recommended_start（含 basis）；
   * 后端未升级、或该字段为 null 时退化为「最近收录」——绝不自己标「推荐入门」。
   */
  const startCard = useMemo(() => {
    const source = recommended?.video ?? mergedVideos[0] ?? null;
    if (!source) return null;
    const id = idOf(source);
    if (!id) return null;
    const merged = mergedVideos.find((video) => idOf(video) === id) ?? source;
    const basis: ChannelStartBasis =
      recommended?.basis === "lowest_difficulty" ? "lowest_difficulty" : "latest";
    return { video: merged, basis };
  }, [recommended, mergedVideos]);

  useScrollRestore(scrollKey(pathname, searchParams.toString()), videos.length > 0);

  const notFound = errorStatus === 404;
  const collectedCount = channel ? total || channel.video_count || 0 : 0;
  const introText = channel
    ? channel.positioning_zh?.trim() || channel.description?.trim() || null
    : null;
  const accentLabel = channel?.accent_label?.trim() || null;
  const followerCount =
    channel && typeof channel.follower_count === "number" && channel.follower_count > 0
      ? channel.follower_count
      : null;
  // 上游认证只在有「上游快照」可同行对照时才展示，且明确标注来源。
  const showOriginalVerified = Boolean(channel?.is_verified) && followerCount !== null;

  // 事实行：本站收录量 / 难度 / 口音 / 上游快照。分隔点跟随后一项，
  // 这样换行时不会出现「上一行以 · 收尾」的孤儿分隔符。
  const headerFacts: { key: string; label: string; title?: string }[] = [
    { key: "collected", label: formatCollectedVideos(collectedCount) },
  ];
  if (channel?.subscriber_count && channel.subscriber_count > 0) {
    headerFacts.push({ key: "subscribers", label: `${channel.subscriber_count} 人订阅` });
  }
  if (channel?.recent_video_count && channel.recent_video_count > 0) {
    headerFacts.push({ key: "recent", label: `近 30 天新增 ${channel.recent_video_count} 段` });
  }
  if (difficultyText) headerFacts.push({ key: "difficulty", label: `难度 ${difficultyText}` });
  if (accentLabel) headerFacts.push({ key: "accent", label: `口音：${accentLabel}` });
  if (followerCount !== null) {
    headerFacts.push({
      key: "follower",
      label: `原平台粉丝（抓取快照）${formatViews(followerCount)}`,
      title: "原平台粉丝数来自上游平台的抓取快照，不是本站订阅人数",
    });
  }
  if (showOriginalVerified) {
    headerFacts.push({
      key: "verified",
      label: "原平台认证",
      title: "上游平台的认证标记，不代表 SeeWord 官方认证",
    });
  }

  const backLink = (
    <Link
      href="/channels"
      className="mb-4 inline-flex items-center gap-1 text-copy text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft size={14} aria-hidden />
      全部频道
    </Link>
  );

  return (
    <PageTransition>
      <div className="user-page">
        {error ? (
          <>
            {backLink}
            {notFound ? (
              <EmptyState
                icon={Radio}
                title="没有找到这个频道"
                description="频道可能已下架，或链接地址有误。"
                action={
                  <LinkButton variant="outline" size="sm" href="/channels">
                    浏览全部频道
                  </LinkButton>
                }
              />
            ) : (
              <ErrorState title={error} onRetry={() => load(1, false)} className="py-16" />
            )}
          </>
        ) : channel ? (
          <>
            <PageHeader
              crumb={
                <Link
                  href="/channels"
                  className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                >
                  <ArrowLeft size={13} aria-hidden />
                  全部频道
                </Link>
              }
              title={
                <span className="flex items-center gap-3 sm:gap-4">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-pill border border-hairline bg-surface-card sm:size-16">
                    {channel.cover_url ? (
                      <Image src={channel.cover_url} alt="" sizes="64px" loading="eager" />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center text-title font-bold text-muted"
                        aria-hidden
                      >
                        {userInitial(channel.name)}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 break-words">{channel.name}</span>
                </span>
              }
              description={
                <>
                  {introText && (
                    <span
                      className="line-clamp-3 block max-w-[62ch] text-copy-lg leading-relaxed text-body"
                      title={introText}
                    >
                      {introText}
                    </span>
                  )}
                  {directionChips.length > 0 && (
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                      {directionChips.map((label) => (
                        <span
                          key={label}
                          className="inline-flex h-6 items-center rounded-pill border border-hairline bg-surface-soft px-2.5 text-caption font-semibold text-body"
                        >
                          {label}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta tabular-nums text-muted sm:gap-x-2">
                    {headerFacts.map((fact, index) => (
                      <span
                        key={fact.key}
                        title={fact.title}
                        className="inline-flex items-center gap-2 whitespace-nowrap"
                      >
                        {index > 0 && <FactSeparator />}
                        {fact.label}
                      </span>
                    ))}
                  </span>
                </>
              }
              actions={<ChannelSubscribeButton slug={channel.slug} />}
            />

            <div className="user-page-layout has-aside">
              <div className="user-page-main">
                {startCard && (
                  <ChannelStartCard
                    video={startCard.video}
                    basis={startCard.basis}
                    slug={channel.slug}
                  />
                )}

                <section aria-labelledby="channel-videos-title">
                  <div className="user-sec-head">
                    <h2 id="channel-videos-title" className="user-sec-title">
                      频道内容
                    </h2>
                    <span className="user-sec-sub tabular-nums">
                      {videos.length < total
                        ? `已显示 ${videos.length} / ${total} 段`
                        : `共 ${total} 段`}
                    </span>
                  </div>

                  {videos.length === 0 ? (
                    <EmptyState
                      icon={Radio}
                      title="该频道暂无视频"
                      description="视频入库并发布后会出现在这里。也可以先去首页按难度挑一段。"
                      action={
                        <LinkButton variant="outline" size="sm" href="/">
                          去首页挑一段
                        </LinkButton>
                      }
                    />
                  ) : (
                    <ul className="mt-1">
                      {mergedVideos.map((video, index) => {
                        const videoId = idOf(video);
                        const badge =
                          startCard && videoId && videoId === idOf(startCard.video)
                            ? startCard.basis === "lowest_difficulty"
                              ? "推荐入门"
                              : "最近收录"
                            : null;
                        return (
                          <li
                            key={videoId || `row-${index}`}
                            className="border-t border-hairline-soft first:border-t-0"
                          >
                            <ChannelVideoRow
                              video={video}
                              slug={channel.slug}
                              badge={badge}
                              eager={index === 0}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {hasMore && (
                    <div className="mt-8 flex flex-col items-center gap-2">
                      {loadMoreError && (
                        <p className="text-meta text-error-text">{loadMoreError}</p>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => load(page + 1, true)}
                        disabled={loadingMore}
                      >
                        {loadingMore ? "加载中…" : loadMoreError ? "重试" : "加载更多"}
                      </Button>
                    </div>
                  )}
                </section>
              </div>

              <aside className="user-page-aside" aria-label="频道信息">
                <section className="user-aside-sec">
                  <h2 className="user-aside-title">频道信息</h2>
                  <div className="user-kv">
                    <div className="user-kv-row">
                      <span className="user-kv-key">本站收录</span>
                      <span className="user-kv-val tabular-nums">{collectedCount} 段</span>
                    </div>
                    {difficultyText && (
                      <div className="user-kv-row">
                        <span className="user-kv-key">内容难度</span>
                        <span className="user-kv-val">{difficultyText}</span>
                      </div>
                    )}
                    {accentLabel && (
                      <div className="user-kv-row">
                        <span className="user-kv-key">口音</span>
                        <span className="user-kv-val">{accentLabel}</span>
                      </div>
                    )}
                  </div>
                  {directionChips.length > 0 && (
                    <div className="mt-3">
                      <p className="text-meta text-muted">学习方向</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {directionChips.map((label) => (
                          <span
                            key={label}
                            className="inline-flex h-6 items-center rounded-pill border border-hairline bg-surface-soft px-2.5 text-caption font-semibold text-body"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="user-aside-sec">
                  <h2 className="user-aside-title">订阅之后</h2>
                  <p className="text-meta leading-relaxed text-body">
                    订阅后会出现在「频道」页的「我订阅的频道」，方便回到这里查看最近收录、继续没学完的内容；随时可以取消。
                  </p>
                </section>

                {related.length > 0 && (
                  <section className="user-aside-sec">
                    <h2 className="user-aside-title">相关频道</h2>
                    <div className="flex flex-col gap-1">
                      {related.map((item) => (
                        <Link
                          key={item.id}
                          href={`/channels/${item.slug}`}
                          className="group flex items-center gap-2.5 rounded-md py-1.5 transition-colors hover:bg-surface-soft"
                        >
                          <span className="relative size-8 shrink-0 overflow-hidden rounded-pill border border-hairline bg-surface-card">
                            {item.cover_url ? (
                              <Image src={item.cover_url} alt="" sizes="32px" />
                            ) : (
                              <span
                                className="flex h-full w-full items-center justify-center text-caption font-bold text-muted"
                                aria-hidden
                              >
                                {userInitial(item.name)}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-meta font-semibold text-ink transition-colors group-hover:text-brand-700">
                              {item.name}
                            </span>
                            <span className="block text-caption tabular-nums text-muted">
                              本站 {item.video_count} 段
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </aside>
            </div>
          </>
        ) : (
          <ChannelDetailSkeleton />
        )}
      </div>
    </PageTransition>
  );
}
