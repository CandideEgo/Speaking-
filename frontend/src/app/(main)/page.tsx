"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useHomeFeed } from "@/hooks/useHomeFeed";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCardGrid } from "@/components/common/SkeletonCard";
import { PageTransition } from "@/components/common/PageTransition";
import type { Video, UserPreferences, LearningRecord } from "@/types";

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

/* ── Difficulty tab groups ── */
const DIFFICULTY_GROUPS = [
  { id: "all", label: "全部", levels: [] },
  { id: "beginner", label: "初级 A1-A2", levels: ["A1", "A2"] },
  { id: "intermediate", label: "中级 B1-B2", levels: ["B1", "B2"] },
  { id: "advanced", label: "高级 C1-C2", levels: ["C1", "C2"] },
];

export default function HomePage() {
  const { user } = useAuthStore();
  const userName = user?.name || "学习者";

  const {
    videos,
    loading,
    error,
    retry,
    activeDifficulty,
    setActiveDifficulty,
  } = useHomeFeed();

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [attempts, setAttempts] = useState<
    { id: string; created_at: string }[]
  >([]);
  const [inProgressRecords, setInProgressRecords] = useState<LearningRecord[]>(
    [],
  );

  useEffect(() => {
    (async () => {
      try {
        const [prefs, attemptsRes, recordsRes] = await Promise.all([
          api<UserPreferences>("/api/v1/users/me/preferences").catch(
            () => null,
          ),
          api<{ items: { id: string; created_at: string }[] }>(
            "/api/v1/speaking/attempts?page=1&page_size=200",
          ).catch(() => ({ items: [] })),
          api<{ records: LearningRecord[] }>(
            "/api/v1/learning/records?page=1&page_size=4&completed=false",
          ).catch(() => ({ records: [] })),
        ]);
        setPreferences(prefs);
        setAttempts(attemptsRes.items);
        setInProgressRecords(recordsRes.records);
      } catch {
        // silent fallback
      }
    })();
  }, []);

  // Map active difficulty group to tab id
  function difficultyGroupFromLevel(level: string): string {
    if (level === "all") return "all";
    for (const g of DIFFICULTY_GROUPS) {
      if (g.levels.includes(level)) return g.id;
    }
    return "all";
  }

  function handleGroupSelect(groupId: string) {
    const group = DIFFICULTY_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    // If switching groups, set to first level in that group (or 'all')
    if (group.id === "all") {
      setActiveDifficulty("all");
    } else if (group.levels.length > 0) {
      // Keep current level if it's in the new group, otherwise pick the first
      if (group.levels.includes(activeDifficulty)) {
        // stay on current level
      } else {
        setActiveDifficulty(group.levels[0]);
      }
    }
  }

  // Count videos per category tag
  const categoryCounts: Record<string, number> = {};
  for (const v of videos) {
    const tag = v.topic_tags?.split(",")[0]?.trim() || "其他";
    categoryCounts[tag] = (categoryCounts[tag] || 0) + 1;
  }

  function toISODate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  const todayISO = toISODate(new Date());
  const todayAttempts = attempts.filter(
    (a) => a.created_at.slice(0, 10) === todayISO,
  ).length;
  const dailyGoal = preferences?.daily_goal_value || 5;
  const goalMet = todayAttempts >= dailyGoal;

  function computeStreak() {
    const dates = new Set(attempts.map((a) => a.created_at.slice(0, 10)));
    const today = toISODate(new Date());
    const yesterday = toISODate(new Date(Date.now() - 86400000));
    let current = dates.has(today)
      ? today
      : dates.has(yesterday)
        ? yesterday
        : null;
    if (!current) return 0;
    let streak = 0;
    const d = new Date(current);
    while (dates.has(toISODate(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  const streak = computeStreak();

  // Continue watching: real in-progress records, fallback to first 4 videos
  const continueWatching =
    inProgressRecords.length > 0
      ? inProgressRecords.map((r) => ({
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
        }))
      : videos.slice(0, 4);

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
                  : `还差 ${Math.max(0, dailyGoal - todayAttempts)} 次口语练习即可达成今日目标。从一条真实演讲开始。`}
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
              <div className="foot">最长连胜保持中 · 继续加油</div>
            </div>
            <div className="b-goal">
              <div>
                <div className="lbl">Daily Goal</div>
                <div className="num">
                  {todayAttempts}
                  <small>/{dailyGoal}</small>
                </div>
              </div>
              <div>
                <div className="b-goal-track">
                  <div
                    className="b-goal-fill"
                    style={{
                      width: `${Math.min(100, (todayAttempts / dailyGoal) * 100)}%`,
                    }}
                  />
                </div>
                <div className="foot">
                  {goalMet
                    ? "今日目标已达成 🎉"
                    : `还差 ${Math.max(0, dailyGoal - todayAttempts)} 次达成目标`}
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
              {continueWatching.map((v, i) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  feat={i === 0}
                  progress={inProgressRecords.length > 0 ? 62 : undefined}
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
                  <img src={cat.img} alt="" loading="lazy" />
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
              const isActive =
                difficultyGroupFromLevel(activeDifficulty) === group.id;
              return (
                <button
                  key={group.id}
                  className={`tab-pill ${isActive ? "tab-pill-active" : ""}`}
                  onClick={() => handleGroupSelect(group.id)}
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

/* ── 分类元数据（带预览图 + 难度区间，用于视觉化大卡） ── */
const CATEGORIES_WITH_META = CATEGORIES.map((c) => ({
  ...c,
  img: `https://picsum.photos/seed/cat-${c.tag}/400/300`,
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
