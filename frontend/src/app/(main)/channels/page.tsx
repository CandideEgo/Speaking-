"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Radio, Search, X } from "lucide-react";
import { ChannelCard } from "@/components/channels/ChannelCard";
import { SubscribedChannels } from "@/components/channels/SubscribedChannels";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageTransition } from "@/components/common/PageTransition";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/LinkButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabPills } from "@/components/ui/TabPills";
import { api } from "@/lib/api";
import { channelMatchesQuery } from "@/lib/channelLearning";
import type { ChannelSubscriptionSummary, ChannelSummary } from "@/types/channels";

/**
 * 频道目录：按学习需求找到一个能长期跟学的来源。
 *
 * 页面形态（本轮改版）：
 * - 顶部压缩成短标题 + 一行说明 + 一行事实（频道 / 收录 / 已订阅），不再有
 *   统计侧栏与封面说明，首屏尽早露出完整频道卡片；
 * - 学习方向来自服务端 `learning_directions`，只列当前数据里真实存在的方向；
 * - 搜索走 `lib/channelLearning.ts` 的统一口径（名称、中文定位、方向同义词、
 *   真实视频标题），不在组件里判断频道名；
 * - 订阅入口来自订阅接口一次请求，卡片状态与「我订阅的频道」共用同一份数据。
 */

// 频道目录是小体量目录（当前全站二十余个）。接口单页上限 100，一次取满才能让
// 搜索与方向计数覆盖整个目录；目录变大时仍通过「加载更多」翻页。
const PAGE_SIZE = 100;

interface ChannelsResponse {
  items: ChannelSummary[];
  page: number;
  page_size: number;
  has_more: boolean;
  total?: number;
}

type SubscriptionStatus = "loading" | "ready" | "failed";

interface DirectionOption {
  id: string;
  label: string;
  count: number;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appendError, setAppendError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("all");
  const [subscriptions, setSubscriptions] = useState<ChannelSubscriptionSummary[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("loading");

  const load = useCallback(async (targetPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    setAppendError(null);
    try {
      const data = await api<ChannelsResponse>(
        `/api/v1/channels?page=${targetPage}&page_size=${PAGE_SIZE}`
      );
      setPage(targetPage);
      setHasMore(Boolean(data.has_more));
      setChannels((prev) => (append ? [...prev, ...data.items] : data.items));
      setTotal(data.total ?? data.items.length);
    } catch (e) {
      const message = e instanceof Error ? e.message : "加载失败";
      if (append) setAppendError(message);
      else setError(message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(1, false);
  }, [load]);

  // 订阅集合只取一次：同时供「我订阅的频道」与卡片上的「已订阅」状态使用，
  // 避免每张卡片各发一次请求。
  useEffect(() => {
    const controller = new AbortController();
    api<ChannelSubscriptionSummary[]>("/api/v1/discovery/subscriptions", {
      signal: controller.signal,
    })
      .then((items) => {
        if (controller.signal.aborted) return;
        setSubscriptions(Array.isArray(items) ? items : []);
        setSubscriptionStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSubscriptionStatus("failed");
      });
    return () => controller.abort();
  }, []);

  const channelTotal = total || channels.length;
  const isFiltered = query.trim().length > 0 || direction !== "all";

  const collectedVideos = useMemo(
    () => channels.reduce((sum, channel) => sum + (channel.video_count || 0), 0),
    [channels]
  );
  const collectedLabel = hasMore
    ? `已加载 ${collectedVideos} 段收录`
    : `本站收录 ${collectedVideos} 段视频`;

  // 方向 chips：只保留当前数据里真实存在的方向，数量是这些方向下的频道数。
  const directionOptions = useMemo<DirectionOption[]>(() => {
    const counts = new Map<string, DirectionOption>();
    for (const channel of channels) {
      for (const option of channel.learning_directions ?? []) {
        if (!option?.id || !option.label) continue;
        const existing = counts.get(option.id);
        if (existing) existing.count += 1;
        else counts.set(option.id, { id: option.id, label: option.label, count: 1 });
      }
    }
    return [...counts.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN")
    );
  }, [channels]);

  const directionTabs = useMemo(
    () => [
      {
        key: "all",
        label: (
          <>
            全部<span className="ml-1 tabular-nums opacity-70">{channels.length}</span>
          </>
        ),
      },
      ...directionOptions.map((option) => ({
        key: option.id,
        label: (
          <>
            {option.label}
            <span className="ml-1 tabular-nums opacity-70">{option.count}</span>
          </>
        ),
      })),
    ],
    [channels.length, directionOptions]
  );

  const visibleChannels = useMemo(
    () =>
      channels.filter(
        (channel) =>
          (direction === "all" ||
            (channel.learning_directions ?? []).some((option) => option.id === direction)) &&
          channelMatchesQuery(channel, query)
      ),
    [channels, direction, query]
  );

  const subscribedSlugs = useMemo(
    () => new Set(subscriptions.map((item) => item.slug)),
    [subscriptions]
  );

  // 卡片内直接订阅/取消后，重新拉一次订阅集合：摘要里还有未学数量、最近视频等
  // 卡片不需要但列表顶部会展示的字段，按服务端形状刷新比本地拼一份更可靠。
  const refreshSubscriptions = useCallback(() => {
    api<ChannelSubscriptionSummary[]>("/api/v1/discovery/subscriptions")
      .then((items) => {
        setSubscriptions(Array.isArray(items) ? items : []);
        setSubscriptionStatus("ready");
      })
      .catch(() => setSubscriptionStatus("failed"));
  }, []);

  const activeDirectionLabel =
    directionOptions.find((option) => option.id === direction)?.label ?? "";
  const trimmedQuery = query.trim();
  const noResultDescription =
    trimmedQuery && direction !== "all"
      ? `「${trimmedQuery}」在「${activeDirectionLabel}」方向下没有匹配的频道。`
      : trimmedQuery
        ? `「${trimmedQuery}」没有匹配的频道名称、学习方向或视频标题。`
        : `「${activeDirectionLabel}」方向下暂时没有频道。`;

  const clearFilters = () => {
    setQuery("");
    setDirection("all");
  };

  return (
    <PageTransition>
      <div className="user-page">
        <PageHeader crumb="频道" title="全部频道" />

        {/* 一行事实：加载完成前用占位条，不闪「0 个频道」 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta tabular-nums text-muted">
          {loading && channels.length === 0 ? (
            <span className="inline-flex flex-wrap items-center gap-2" aria-label="频道数据加载中">
              <span className="h-3 w-16 animate-pulse rounded-sm bg-surface-card" />
              <span className="h-3 w-24 animate-pulse rounded-sm bg-surface-card" />
              {subscriptionStatus === "loading" && (
                <span className="h-3 w-16 animate-pulse rounded-sm bg-surface-card" />
              )}
            </span>
          ) : channels.length > 0 ? (
            <>
              <span>{channelTotal} 个频道</span>
              <span aria-hidden>·</span>
              <span>{collectedLabel}</span>
              {subscriptionStatus === "loading" ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="h-3 w-16 animate-pulse rounded-sm bg-surface-card" />
                </>
              ) : subscriptionStatus === "ready" ? (
                <>
                  <span aria-hidden>·</span>
                  <span>已订阅 {subscriptions.length} 个</span>
                </>
              ) : null}
            </>
          ) : null}
        </div>

        <SubscribedChannels items={subscriptions} />

        <section aria-label="频道目录" className="mt-8">
          <div className="border-b border-hairline pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative block w-full max-w-md" role="search">
                <label htmlFor="channel-search" className="sr-only">
                  搜索频道、学习方向或视频标题
                </label>
                <Search
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  id="channel-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-10 w-full rounded-md border border-hairline-strong bg-surface-soft pl-9 pr-10 text-copy text-ink placeholder:text-muted focus:border-ink focus:bg-canvas focus:outline-none"
                  placeholder="搜索频道、方向或视频标题"
                />
                {query.trim() && (
                  <button
                    type="button"
                    aria-label="清空频道搜索"
                    onClick={() => setQuery("")}
                    className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-sm text-muted transition-colors hover:bg-surface-card hover:text-ink"
                  >
                    <X size={15} aria-hidden />
                  </button>
                )}
              </div>
              {isFiltered && (
                <div className="flex items-center gap-2">
                  <span className="text-meta tabular-nums text-muted" aria-live="polite">
                    显示 {visibleChannels.length} / {channelTotal}
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    清空筛选
                  </Button>
                </div>
              )}
            </div>
            {directionOptions.length > 0 && (
              <div className="mt-3 flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-none">
                <TabPills
                  tabs={directionTabs}
                  activeKey={direction}
                  onChange={setDirection}
                  variant="chips"
                  className="flex-nowrap"
                />
              </div>
            )}
          </div>

          {error && <ErrorState title={error} onRetry={() => load(1, false)} className="py-8" />}

          {!error && loading && channels.length === 0 && (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} padding={0} className="animate-pulse overflow-hidden">
                  <div className="flex items-start gap-3 p-4">
                    <div className="h-11 w-11 shrink-0 rounded-pill bg-surface-card" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-2/3 rounded-sm bg-surface-card" />
                      <div className="h-3 w-full rounded-sm bg-surface-card" />
                    </div>
                  </div>
                  <div className="mt-2 flex gap-1.5 px-4">
                    <div className="h-6 w-16 rounded-pill bg-surface-card" />
                    <div className="h-6 w-14 rounded-pill bg-surface-card" />
                  </div>
                  <div className="mt-3 space-y-2 px-4 pb-4">
                    <div className="h-3 w-1/2 rounded-sm bg-surface-card" />
                    <div className="h-3 w-2/3 rounded-sm bg-surface-card" />
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!error && !loading && channels.length === 0 && (
            <EmptyState
              icon={Radio}
              title="还没有频道"
              description="视频入库后作者频道会自动创建。也可以先去浏览视频，按难度挑一段。"
              action={
                <LinkButton variant="outline" size="sm" href="/">
                  去浏览视频
                </LinkButton>
              }
            />
          )}

          {!error && visibleChannels.length > 0 && (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleChannels.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  subscribed={subscribedSlugs.has(channel.slug)}
                  onSubscriptionChange={refreshSubscriptions}
                />
              ))}
            </div>
          )}

          {!error && !loading && channels.length > 0 && visibleChannels.length === 0 && (
            <EmptyState
              icon={Search}
              title="没有找到匹配的频道"
              description={noResultDescription}
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                    清空搜索
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    查看全部方向
                  </Button>
                </div>
              }
            />
          )}

          {hasMore && (
            <div className="mt-6 flex flex-col items-center gap-2">
              {appendError && <p className="text-meta text-error-text">{appendError}</p>}
              <Button variant="outline" onClick={() => load(page + 1, true)} disabled={loadingMore}>
                {loadingMore ? "加载中…" : appendError ? "重试加载更多" : "加载更多频道"}
              </Button>
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
