"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Play, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useHomeFeed, DIFFICULTY_GROUPS } from "@/hooks/useHomeFeed";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
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

/* ── Category data ── */
const CATEGORIES = [
  { emoji: "🎤", label: "TED Talks", tag: "TED" },
  { emoji: "🎙️", label: "访谈", tag: "访谈" },
  { emoji: "📰", label: "新闻", tag: "新闻" },
  { emoji: "📹", label: "Vlog", tag: "Vlog" },
  { emoji: "📚", label: "教育", tag: "教育" },
  { emoji: "🎬", label: "电影片段", tag: "电影" },
  { emoji: "💻", label: "科技", tag: "科技" },
  { emoji: "🛒", label: "商业", tag: "商业" },
];

export default function HomePage() {
  const { user } = useAuthStore();
  const userName = user?.name || "学习者";

  const { videos, loading, error, retry, activeGroup, setActiveGroup } =
    useHomeFeed();

  const [streakInfo, setStreakInfo] = useState<{
    current_streak: number;
    longest_streak: number;
    goal_type: string;
    goal_value: number;
    today_progress: Record<string, number>;
  } | null>(null);
  const [inProgressRecords, setInProgressRecords] = useState<LearningRecord[]>(
    [],
  );

  useEffect(() => {
    (async () => {
      try {
        const [streakRes, recordsRes] = await Promise.all([
          api<{
            current_streak: number;
            longest_streak: number;
            goal_type: string;
            goal_value: number;
            today_progress: Record<string, number>;
          }>("/api/v1/users/me/streak").catch(() => null),
          api<{ records: LearningRecord[] }>(
            "/api/v1/learning/records?page=1&page_size=4&completed=false",
          ).catch(() => ({ records: [] })),
        ]);
        if (streakRes) setStreakInfo(streakRes);
        setInProgressRecords(recordsRes.records);
      } catch {
        // silent fallback
      }
    })();
  }, []);

  // Count videos per category tag
  const categoryCounts: Record<string, number> = {};
  for (const v of videos) {
    const tag = v.topic_tags?.split(",")[0]?.trim() || "其他";
    categoryCounts[tag] = (categoryCounts[tag] || 0) + 1;
  }

  const streak = streakInfo?.current_streak ?? 0;
  const longestStreak = streakInfo?.longest_streak ?? 0;
  const goalType = streakInfo?.goal_type ?? "speaking_attempts";
  const goalValue = streakInfo?.goal_value ?? 5;
  const todayProgress = streakInfo?.today_progress?.[goalType] ?? 0;
  const goalMet = todayProgress >= goalValue;
  const goalUnit =
    goalType === "minutes" ? "分钟" : goalType === "words" ? "单词" : "次练习";

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
        {/* ── Bento 首屏：hero + 连胜 + 目标 ── */}
        <div className="bento">
          {/* hero 大卡 */}
          <div className="b-hero">
            <div className="flex items-start justify-between">
              <span className="b-hero-tag">
                <span className="led" />
                每日练习 ·{" "}
                {new Date().toLocaleDateString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                })}
              </span>
              <span className="text-[22px]">🔥</span>
            </div>
            <div>
              <h1>
                你好{userName}，
                <br />
                把英语<em>说出口</em>。
              </h1>
              <p className="b-hero-sub">
                {goalMet
                  ? "今日目标已达成！继续保持，或挑战更高难度。"
                  : `还差 ${Math.max(0, goalValue - todayProgress)} ${goalUnit}即可达成今日目标。从一条真实演讲开始。`}
              </p>
              <div className="b-hero-cta">
                <LinkButton
                  href="/speaking"
                  variant="primary"
                  icon={Play}
                  size="nav"
                >
                  开始口语练习
                </LinkButton>
                <LinkButton href="/browse" variant="ghostDark" size="nav">
                  浏览视频库
                </LinkButton>
              </div>
            </div>
          </div>

          {/* 连胜 + 目标 栈 */}
          <div className="b-stack">
            <div className="b-streak">
              <div>
                <div className="lbl">Current Streak</div>
                <div className="big">
                  {streak}
                  <small>天</small>
                </div>
              </div>
              <div className="foot">最长 {longestStreak} 天 · 继续加油</div>
            </div>
            <div className="b-goal">
              <div>
                <div className="lbl">Daily Goal</div>
                <div className="num">
                  {todayProgress}
                  <small>/{goalValue}</small>
                </div>
              </div>
              <div>
                <div className="b-goal-track">
                  <div
                    className="b-goal-fill"
                    style={{
                      width: `${Math.min(100, (todayProgress / goalValue) * 100)}%`,
                    }}
                  />
                </div>
                <div className="foot">
                  {goalMet
                    ? "今日目标已达成 🎉"
                    : `还差 ${Math.max(0, goalValue - todayProgress)} ${goalUnit}达成目标`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 今日练习入口 ── */}
        <div className="bento">
          <div className="b-practice">
            <div>
              <div className="lbl">Quick Practice</div>
              <div className="title">选择练习模式，60 秒开口说</div>
            </div>
            <div className="b-practice-modes">
              <Link href="/speaking?mode=read_aloud" className="mode-chip">
                <span className="dot r" />
                朗读 <small>Read aloud</small>
              </Link>
              <Link href="/speaking?mode=shadowing" className="mode-chip">
                <span className="dot m" />
                跟读 <small>Shadowing</small>
              </Link>
              <Link href="/speaking?mode=free_speaking" className="mode-chip">
                <span className="dot f" />
                自由说 <small>Free speaking</small>
              </Link>
            </div>
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

        {/* ── 分类视觉化大卡 ── */}
        <section>
          <SectionHeader
            title="按分类浏览"
            action={
              <Link href="/browse">
                <SectionLink>
                  查看全部
                  <ArrowRight size={15} />
                </SectionLink>
              </Link>
            }
          />
          <div className="cat-feat">
            {CATEGORIES_WITH_META.map((cat) => {
              const count = categoryCounts[cat.tag];
              return (
                <Link
                  key={cat.tag}
                  href={`/browse?category=${encodeURIComponent(cat.tag)}`}
                  className="cat-big"
                >
                  <div className={`cat-bg bg-gradient-to-br ${cat.gradient}`} />
                  <div className="ov" />
                  {count ? null : <span className="lv">COMING SOON</span>}
                  <div className="meta">
                    <div className="emoji">{cat.emoji}</div>
                    <div className="label">{cat.label}</div>
                    <div className="count">
                      {count ? `${count} 个视频 · ${cat.range}` : "即将上线"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

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

/* ── 分类元数据（确定性渐变 + 难度区间，用于视觉化大卡） ── */
const CATEGORY_GRADIENTS: Record<string, string> = {
  TED: "from-violet-500 to-indigo-600",
  访谈: "from-rose-500 to-pink-600",
  新闻: "from-sky-500 to-blue-600",
  Vlog: "from-amber-500 to-orange-600",
  教育: "from-emerald-500 to-teal-600",
  电影: "from-fuchsia-500 to-purple-600",
  科技: "from-cyan-500 to-sky-600",
  商业: "from-lime-500 to-green-600",
};

const CATEGORIES_WITH_META = CATEGORIES.map((c) => ({
  ...c,
  gradient: CATEGORY_GRADIENTS[c.tag] ?? "from-brand-500 to-brand-400",
  range:
    c.tag === "TED" || c.tag === "新闻"
      ? "B1–C1"
      : c.tag === "访谈" || c.tag === "电影"
        ? "B2–C2"
        : c.tag === "Vlog"
          ? "A2–B1"
          : c.tag === "教育"
            ? "A1–B1"
            : c.tag === "科技"
              ? "B2–C1"
              : "A1–C2",
}));
