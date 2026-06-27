"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useHomeFeed } from "@/hooks/useHomeFeed";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
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
      <main className="container-page py-8 pb-24">
        {/* ── Greeting bar ── */}
        <div className="greet">
          <div>
            <h1 className="text-[30px] font-extrabold tracking-display-md">
              你好,{userName} 👋
            </h1>
            <p className="text-sm text-muted mt-1.5">继续你的学习连胜吧</p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="pill pill-flame-on">
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
                <path d="M12 2C8 6 6 8 6 12a6 6 0 0 0 12 0c0-2-2-4-3-6-1 2-3 2-3-4Z" />
              </svg>
              {streak} 天连胜
            </span>
            <span className={cn("pill", goalMet ? "pill-goal-done" : "")}>
              {goalMet ? (
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
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
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
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
              )}
              今日目标 {goalMet ? "已达成" : `${todayAttempts}/${dailyGoal}`}
            </span>
            <Link href="/speaking" className="btn-primary">
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
              口语练习
            </Link>
          </div>
        </div>

        {/* ── Continue watching ── */}
        {continueWatching.length > 0 && (
          <section>
            <div className="sec-head">
              <h2 className="sec-title">继续观看</h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {continueWatching.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </div>
          </section>
        )}

        {/* ── Category band ── */}
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
          <div className="cat-band scrollbar-hide">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.tag}
                href={`/browse?category=${encodeURIComponent(cat.tag)}`}
                className="cat-card"
              >
                <span className="text-[26px]">{cat.emoji}</span>
                <span className="text-[13px] font-semibold">{cat.label}</span>
                <span className="text-[11px] text-muted">
                  {categoryCounts[cat.tag] ? `${categoryCounts[cat.tag]}` : "—"}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Curated by difficulty ── */}
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

/* ── Video card (vcard pattern) ── */
function VideoCard({ video }: { video: Video }) {
  const category = video.topic_tags?.split(",")[0]?.trim() || "综合";

  return (
    <Link href={`/watch/${video.id}`} className="vcard group">
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
        </div>
      </div>
    </Link>
  );
}
