"use client";

import { Suspense, useEffect, useState } from "react";
import { HomeEditorialHeader, HomeEditorialHero } from "@/components/home/HomeEditorialHero";
import { HomeEditorialScenarios } from "@/components/home/HomeEditorialScenarios";
import { HomeQuickActions } from "@/components/home/HomeQuickActions";
import { FeaturedListening } from "@/components/home/FeaturedListening";
import { HomeFeed } from "@/components/home/HomeFeed";
import { VideoCardSkeleton } from "@/components/ui/VideoCard";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/common/SkeletonCard";
import { fetchHomeEditorial } from "@/lib/homeEditorial";
import { homeScenarioCards } from "@/lib/homeScenarios";
import { useContinueLearning } from "@/hooks/useContinueLearning";
import type { HomeEditorialPage } from "@/types/homeContent";

/**
 * 首页：先回答「今天从哪里开始」。
 *
 * 页头右侧只保留继续观看 / 词汇 / 练习三个紧凑入口；今日推荐是「一张视频
 * 任务卡 + 一句真实原句」。没有已发布编排时用真实精选与真实字幕兜底。
 * 下方发现流保留分类/难度/排序与无限加载。
 */

const EDITORIAL_TIMEOUT_MS = 8000;

/**
 * 本次页面加载共享的首页编排请求（SSR 不发起）。
 *
 * 放在模块级的原因：壳层要先解析登录态 / onboarding，页面组件可能几秒后才 mount；
 * 在这之前先把这条公共 GET 发出去，mount 后直接消费结果，首屏不用再等一次往返。
 * 同时它也消化了 dev StrictMode 的「挂载 → 清理 → 再挂载」：两次 effect 订阅同一
 * 个 promise，不会产生两个请求、也不会把第一个请求 abort 成「假失败」。
 *
 * 不做结果缓存：真正离开页面时 `releaseHomeEditorial()` 用 0ms 延迟清掉请求（重挂载
 * 会取消这个延迟），下次进入首页重新取，发布/下线仍然立即生效。
 */
let editorialRequest: Promise<HomeEditorialPage | null> | null = null;
let editorialAbort: AbortController | null = null;
let editorialReleaseTimer: number | null = null;

function loadHomeEditorial(): Promise<HomeEditorialPage | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (editorialReleaseTimer !== null) {
    clearTimeout(editorialReleaseTimer);
    editorialReleaseTimer = null;
  }
  if (!editorialRequest) {
    const controller = new AbortController();
    editorialAbort = controller;
    const timer = window.setTimeout(() => controller.abort(), EDITORIAL_TIMEOUT_MS);
    const request = fetchHomeEditorial(controller.signal).finally(() => window.clearTimeout(timer));
    // 请求可能在页面 mount 之前就失败（壳层还在解析登录态）；先挂一个空 catch，
    // 避免浏览器把「稍后才被 effect 消费的 rejection」报成 unhandled rejection。
    void request.catch(() => {});
    editorialRequest = request;
  }
  return editorialRequest;
}

function releaseHomeEditorial(): void {
  if (typeof window === "undefined") return;
  if (editorialReleaseTimer !== null) clearTimeout(editorialReleaseTimer);
  editorialReleaseTimer = window.setTimeout(() => {
    editorialReleaseTimer = null;
    // 真正离开页面才取消在途请求；StrictMode 的重挂载会先取消这个定时器。
    editorialAbort?.abort();
    editorialAbort = null;
    editorialRequest = null;
  }, 0);
}

if (typeof window !== "undefined") {
  // 路由 chunk 一到就发起公共读取，与壳层的登录态 / onboarding 门并行。
  void loadHomeEditorial();
}

type EditorialState =
  { status: "loading" } | { status: "editorial"; page: HomeEditorialPage } | { status: "fallback" };

export default function HomePage() {
  const [editorial, setEditorial] = useState<EditorialState>({ status: "loading" });
  const continueLearning = useContinueLearning();
  const hasContinue = Boolean(continueLearning.record);

  useEffect(() => {
    // cancelled 只表示「这次订阅作废」（StrictMode 清理 / 真正卸载）；超时由模块级
    // 请求自己的 AbortController 处理，abort 后的 reject 会走到 fallback。
    let cancelled = false;
    loadHomeEditorial()
      .then((page) => {
        if (cancelled) return;
        setEditorial(page ? { status: "editorial", page } : { status: "fallback" });
      })
      .catch(() => {
        if (cancelled) return;
        setEditorial({ status: "fallback" });
      });
    return () => {
      cancelled = true;
      releaseHomeEditorial();
    };
  }, []);

  return (
    <div className="home-compact pt-4 pb-18">
      <div className="home-topbar">
        <HomeEditorialHeader />
        <HomeQuickActions continueLearning={continueLearning} />
      </div>

      {editorial.status === "editorial" && editorial.page.lead ? (
        <EditorialSection
          page={editorial.page}
          primary={!hasContinue}
          continueVideoId={continueLearning.record?.video_id}
        />
      ) : editorial.status === "loading" ? (
        <EditorialSkeleton />
      ) : (
        <FeaturedListening
          primary={!hasContinue}
          continueVideoId={continueLearning.record?.video_id}
        />
      )}

      {/* id 锚点：站内「去浏览」类入口统一落到 `/`，需要时可 #feed 定位 */}
      <section
        id="feed"
        aria-label="视频列表"
        className="home-video-feed mt-8 scroll-mt-6 border-t border-hairline pt-5"
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-title font-bold tracking-tight text-ink">发现更多视频</h2>
          <p className="text-meta text-muted">按主题、难度筛一段，点词理解，再听原声。</p>
        </div>
        <Suspense fallback={<FeedSkeleton />}>
          <HomeFeed />
        </Suspense>
      </section>
    </div>
  );
}

/** 今日推荐：一张视频任务卡 +（有真实原句时）一张场景卡。 */
function EditorialSection({
  page,
  primary,
  continueVideoId,
}: {
  page: HomeEditorialPage;
  primary: boolean;
  continueVideoId?: string;
}) {
  const lead = page.lead;
  if (!lead) return null;
  const hasScene = Boolean(
    homeScenarioCards({
      videoId: lead.video.id,
      scenarios: page.scenarios,
      content: lead.content,
    }).length
  );

  return (
    <div
      className={
        hasScene
          ? "mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start"
          : "mt-4"
      }
    >
      <div id="home-listening" className="min-w-0">
        <HomeEditorialHero page={page} primary={primary} continueVideoId={continueVideoId} />
      </div>
      {hasScene && (
        <HomeEditorialScenarios
          key={lead.video.id}
          videoId={lead.video.id}
          scenarios={page.scenarios}
          content={lead.content}
        />
      )}
    </div>
  );
}

function EditorialSkeleton() {
  return (
    <Card padding={5} aria-label="正在准备今日精选" role="status">
      <div className="grid gap-5 md:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <Skeleton className="aspect-video" />
        <div className="space-y-3 py-2">
          <Skeleton className="h-3 w-24 rounded-pill" />
          <Skeleton className="h-6 w-4/5 rounded-pill" />
          <Skeleton className="h-4 w-3/5 rounded-pill" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>
    </Card>
  );
}

function FeedSkeleton() {
  return (
    <div className="user-content-list">
      {Array.from({ length: 8 }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
