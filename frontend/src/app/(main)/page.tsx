"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useHomeFeed, DIFFICULTY_GROUPS } from "@/hooks/useHomeFeed";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCardGrid } from "@/components/common/SkeletonCard";
import { PageTransition } from "@/components/common/PageTransition";
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
    today_progress: number;
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
            today_progress: number;
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
  const todayProgress = streakInfo?.today_progress ?? 0;
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
            video_url_480p: null,
            video_url_720p: null,
            video_url_1080p: null,
            processing_mode: null,
            processing_step: null,
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
                <Link href="/speaking" className="btn-go">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="3" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0" />
                  </svg>
                  开始口语练习
                </Link>
                <Link href="/browse" className="btn-ghost-d">
                  浏览视频库
                </Link>
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
            <div className="sec-head">
              <h2 className="sec-title">继续观看</h2>
              <span className="text-xs text-muted font-mono">
                {continueWatching.length} 个进行中
              </span>
            </div>
            <div className="feat-grid">
              {continueWatching.map((item, i) => (
                <VideoCard
                  key={item.video.id}
                  video={item.video}
                  feat={i === 0}
                  progress={item.progress}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── 分类视觉化大卡 ── */}
        <section>
          <div className="sec-head">
            <h2 className="sec-title">按分类浏览</h2>
            <Link href="/browse" className="sec-link">
              查看全部
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
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
          <div className="sec-head">
            <h2 className="sec-title">按难度精选</h2>
            <Link href="/browse" className="sec-link">
              更多
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>

          {/* Difficulty pill tabs */}
          <div className="tab-container mb-6">
            {DIFFICULTY_GROUPS.map((group) => {
              const isActive = activeGroup === group.id;
              return (
                <button
                  key={group.id}
                  className={`tab-pill ${isActive ? "tab-pill-active" : ""}`}
                  onClick={() => setActiveGroup(group.id)}
                >
                  {group.label}
                </button>
              );
            })}
          </div>

          {/* Video grid */}
          {loading ? (
            <SkeletonCardGrid count={8} />
          ) : error ? (
            <EmptyState
              icon={Play}
              title="加载失败"
              description={error}
              action={
                <button onClick={retry} className="btn-primary">
                  重试
                </button>
              }
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

/* ── Video card (vcard pattern, 支持 feat 主推大卡 + progress 进度标记) ── */
function VideoCard({
  video,
  feat = false,
  progress,
}: {
  video: Video;
  feat?: boolean;
  progress?: number;
}) {
  const category = video.topic_tags?.split(",")[0]?.trim() || "综合";

  return (
    <Link
      href={`/watch/${video.id}`}
      className={`vcard group ${feat ? "vcard-feat" : ""}`}
    >
      <div className="thumb">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-surface-card flex items-center justify-center">
            <span className="text-2xl font-bold text-muted-soft">
              {video.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {video.difficulty_level && (
          <span className="thumb-lv">{video.difficulty_level}</span>
        )}
        {video.duration && video.duration > 0 && (
          <span className="thumb-dur">{formatDuration(video.duration)}</span>
        )}
        <div className="thumb-play">
          <div className="thumb-play-btn">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="#fff"
              stroke="none"
            >
              <path d="M6 4l14 8-14 8V4Z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="vmeta">
        <p className="vtitle">{video.title}</p>
        <div className="vfoot">
          <span>Speaking</span>
          <span className="vdot" />
          <span className="chip">{category}</span>
          {feat && progress !== undefined && (
            <>
              <span className="vdot" />
              <span className="vprog-tag">{progress}% 已观看</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
