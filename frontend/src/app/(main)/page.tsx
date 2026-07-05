"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Play, ArrowRight, Users } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useHomeFeed, DIFFICULTY_GROUPS } from "@/hooks/useHomeFeed";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCardGrid } from "@/components/common/SkeletonCard";
import { PageTransition } from "@/components/common/PageTransition";
import { CommunityFeedWidget } from "@/components/community/CommunityFeedWidget";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { TabPills } from "@/components/ui/TabPills";
import { SectionHeader, SectionLink } from "@/components/ui/SectionHeader";
import { VideoCard } from "@/components/ui/VideoCard";
import type { Video, LearningRecord } from "@/types";

export default function HomePage() {
  const { user } = useAuthStore();
  const userName = user?.name || "学习者";

  const { videos, loading, error, retry, activeGroup, setActiveGroup } =
    useHomeFeed();

  const [vocabDue, setVocabDue] = useState<number | null>(null);
  const [inProgressRecords, setInProgressRecords] = useState<LearningRecord[]>(
    [],
  );

  useEffect(() => {
    (async () => {
      try {
        const [vocabRes, recordsRes] = await Promise.all([
          api<{ due_count?: number; total?: number }>(
            "/api/v1/vocabulary/stats",
          ).catch(() => null),
          api<{ records: LearningRecord[] }>(
            "/api/v1/learning/records?page=1&page_size=4&completed=false",
          ).catch(() => ({ records: [] })),
        ]);
        if (vocabRes) setVocabDue(vocabRes.due_count ?? 0);
        setInProgressRecords(recordsRes.records);
      } catch {
        // silent fallback
      }
    })();
  }, []);

  // Continue watching: real in-progress records (with progress), fallback to first 4 videos
  const continueWatching: { video: Video; progress?: number }[] =
    inProgressRecords.length > 0
      ? inProgressRecords.map((r) => ({
          video: {
            id: r.video_id,
            title: r.video?.title || "未知视频",
            thumbnail_url: r.video?.thumbnail_url ?? null,
            duration: 0,
            difficulty_level: null,
            source_url: "",
            video_source: "imported",
            status: "ready" as const,
            error_message: null,
            topic_tags: null,
            is_official: true,
            is_published: true,
            review_status: "published" as const,
            rejection_reason: null,
            video_url_480p: null,
            video_url_720p: null,
            video_url_1080p: null,
            processing_mode: null,
            processing_step: null,
            processing_progress: 0,
            like_count: 0,
            favorite_count: 0,
            created_at: r.created_at,
          },
          progress: r.progress_percentage || undefined,
        }))
      : videos.slice(0, 4).map((video) => ({ video }));

  // Curated videos: all filtered videos
  const curatedVideos = videos;

  return (
    <PageTransition>
      <main className="container-page py-7 pb-24">
        {/* ── Bento 首屏：hero + 词汇/社区 ── */}
        <div className="bento">
          {/* hero 大卡 */}
          <div className="b-hero">
            <div className="flex items-start justify-between">
              <span className="b-hero-tag">
                <span className="led" />
                每日学习 ·{" "}
                {new Date().toLocaleDateString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                })}
              </span>
              <span className="text-[22px]">📚</span>
            </div>
            <div>
              <h1>
                你好{userName}，
                <br />
                用真实视频<em>学英语</em>。
              </h1>
              <p className="b-hero-sub">
                双语字幕、生词自动标注与 SM-2
                复习，社区贡献真实视频——一段视频，完整学习闭环。
              </p>
              <div className="b-hero-cta">
                <LinkButton
                  href="/browse"
                  variant="primary"
                  icon={Play}
                  size="nav"
                >
                  开始练习
                </LinkButton>
                <LinkButton href="/browse" variant="ghostDark" size="nav">
                  浏览视频库
                </LinkButton>
              </div>
            </div>
          </div>

          {/* 词汇待复习 + 社区 栈 */}
          <div className="b-stack">
            <Link
              href="/vocabulary"
              className="flex-1 p-6 rounded-lg border flex flex-col justify-between bg-brand-50 border-brand-100 hover:border-brand-300 transition-colors"
            >
              <div>
                <div className="text-[11px] font-semibold uppercase font-mono tracking-[0.14em] text-brand-700">
                  词汇待复习
                </div>
                <div className="text-[44px] font-extrabold tracking-display-lg leading-none mt-2.5 text-brand-600">
                  {vocabDue ?? "—"}
                  <small className="text-[16px] font-semibold ml-1 text-brand-500">
                    词
                  </small>
                </div>
              </div>
              <div className="text-xs font-medium mt-2 text-brand-700">
                {vocabDue === null
                  ? "加载中…"
                  : vocabDue > 0
                    ? "趁热打铁，去复习 →"
                    : "暂无待复习，继续积累"}
              </div>
            </Link>
            <Link
              href="/community"
              className="flex-1 p-6 rounded-lg border bg-canvas border-hairline hover:border-ink transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="text-[11px] font-semibold uppercase font-mono tracking-[0.14em] text-muted-foreground">
                  社区
                </div>
                <div className="flex items-center gap-2 mt-2.5">
                  <Users size={24} className="text-brand-500" />
                  <span className="text-[20px] font-bold tracking-tight">
                    发现新视频
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted mt-2">
                看看大家贡献的内容 →
              </div>
            </Link>
          </div>
        </div>

        {/* ── 继续观看：主推大卡 + 不对称网格 ── */}
        {continueWatching.length > 0 && (
          <section>
            <SectionHeader
              title="继续观看"
              action={
                <span className="text-xs text-muted font-mono">
                  {continueWatching.length} 个进行中
                </span>
              }
            />
            <div className="feat-grid">
              {continueWatching.map((item, i) => (
                <VideoCard
                  key={item.video.id}
                  video={item.video}
                  feat={i === 0}
                  progress={item.progress}
                  className={i === 0 ? "vcard-feat" : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── 社区动态 ── */}
        <CommunityFeedWidget />

        {/* ── 按难度精选 ── */}
        <section>
          <SectionHeader
            title="按难度精选"
            action={
              <Link href="/browse">
                <SectionLink>
                  更多
                  <ArrowRight size={15} />
                </SectionLink>
              </Link>
            }
          />

          {/* Difficulty pill tabs */}
          <TabPills
            tabs={DIFFICULTY_GROUPS.map((g) => ({ key: g.id, label: g.label }))}
            activeKey={activeGroup}
            onChange={setActiveGroup}
            className="mb-6"
          />

          {/* Video grid */}
          {loading ? (
            <SkeletonCardGrid count={8} />
          ) : error ? (
            <EmptyState
              icon={Play}
              title="加载失败"
              description={error}
              action={<Button onClick={retry}>重试</Button>}
            />
          ) : curatedVideos.length === 0 ? (
            <EmptyState
              icon={Play}
              title="暂无视频"
              description="内容正在准备中，请稍后再来"
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {curatedVideos.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </div>
          )}
        </section>
      </main>
    </PageTransition>
  );
}
