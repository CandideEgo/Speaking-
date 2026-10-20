"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, History, Play } from "lucide-react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { useAuthStore } from "@/stores/authStore";
import type { LearningRecord, Paginated } from "@/types";

export function HomeAside() {
  return (
    <aside aria-label="我的学习入口" className="home-personal">
      <VocabularyEntry />
      <ContinueEntry />
      <PracticeEntry />
      <WeeklyEntry />
    </aside>
  );
}

function ContinueEntry() {
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const [records, setRecords] = useState<LearningRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    setFailed(false);
    api<Paginated<LearningRecord>>("/api/v1/learning/records?page=1&page_size=6&completed=false", {
      signal: controller.signal,
    })
      .then((data) => setRecords(data.items))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [authenticated, retry]);
  if (!authenticated) return null;
  if (failed)
    return (
      <section
        className="home-personal-panel"
        data-testid="continue-learning-rail"
        aria-label="继续上次"
      >
        <h2>接着上次学</h2>
        <p>学习记录暂时未能加载。</p>
        <Button variant="ghost" size="compact" onClick={() => setRetry((value) => value + 1)}>
          重试
        </Button>
      </section>
    );
  const record = records?.find((item) => !item.completed && item.progress_percentage > 0);
  if (!record) return null;
  const position = Number.isFinite(record.position_seconds) ? record.position_seconds : null;
  const duration = record.video?.duration;
  const remaining = duration && position !== null ? Math.max(0, duration - position) : null;
  return (
    <section
      className="home-personal-panel home-resume"
      data-testid="continue-learning-rail"
      aria-label="继续上次"
    >
      <div className="home-panel-heading">
        <h2>接着上次学</h2>
        <History size={15} aria-hidden />
      </div>
      <Link href={watchHref(record.video_id, { from: "home" })} className="home-resume-title">
        {record.video?.title || "上一段视频"}
      </Link>
      <p>
        {position !== null ? `停在 ${formatDuration(position)}` : "继续上次的进度"}
        {remaining !== null ? ` · 还剩 ${formatDuration(remaining)}` : ""}
      </p>
      <LinkButton
        href={watchHref(record.video_id, { from: "home" })}
        variant="outline"
        size="sm"
        icon={Play}
        fullWidth
      >
        继续观看
      </LinkButton>
    </section>
  );
}

interface VocabStats {
  total: number;
  due_count: number;
}
interface DueWord {
  id: string;
  word: string;
  translation: string | null;
}

function VocabularyEntry() {
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [words, setWords] = useState<DueWord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    api<VocabStats>("/api/v1/vocabulary/stats", { signal: controller.signal })
      .then((data) => setStats(data))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    api<Paginated<DueWord>>("/api/v1/vocabulary?due_only=true&page=1&page_size=3", {
      signal: controller.signal,
    })
      .then((data) => setWords(data.items))
      .catch(() => {
        if (!controller.signal.aborted) setWords(null);
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <section className="home-personal-panel home-review" aria-label="词汇复习">
      <div className="home-panel-heading">
        <h2>这些词，还记得吗？</h2>
        <BookOpen size={15} aria-hidden />
      </div>
      {failed ? (
        <>
          <p>复习安排暂时未能加载。</p>
          <Button variant="ghost" size="compact" onClick={() => setRetry((value) => value + 1)}>
            重试
          </Button>
        </>
      ) : !stats ? (
        <p role="status">正在读取你的词库…</p>
      ) : (
        <>
          <p className="home-review-summary">
            {stats.due_count > 0 ? (
              <>
                <strong>{stats.due_count}</strong> 词今天到期
              </>
            ) : (
              "今天没有到期词"
            )}
            <span>词库 {stats.total} 词</span>
          </p>
          {stats.due_count > 0 && words && words.length > 0 && (
            <ul className="home-due-words">
              {words.map((word) => (
                <li key={word.id}>
                  <strong>{word.word}</strong>
                  <span>{word.translation?.split("\n")[0] || "去复习里回想词义"}</span>
                </li>
              ))}
            </ul>
          )}
          <p>
            {stats.due_count > 0
              ? "从你收藏过的词开始，回想它们的意思。"
              : "去听一段新内容，把想记住的词收进来。"}
          </p>
          <LinkButton
            href={stats.due_count > 0 ? "/vocabulary/drill" : "/vocabulary"}
            variant="tonal"
            size="sm"
            fullWidth
            icon={ArrowRight}
            iconRight
          >
            {stats.due_count > 0 ? "开始复习" : "翻翻我的词库"}
          </LinkButton>
        </>
      )}
    </section>
  );
}

function PracticeEntry() {
  return (
    <section className="home-personal-panel home-practice" aria-label="练习">
      <div className="home-panel-heading">
        <h2>读一段，练一道思路</h2>
        <span>四六级真题</span>
      </div>
      <p>每组 3–4 题，做完看解析。</p>
      <Link href="/practice/daily?type=reading">
        <strong>仔细阅读</strong>
        <span>
          细节、推断与词义 <ArrowRight size={13} aria-hidden />
        </span>
      </Link>
      <Link href="/practice/daily?type=cloze">
        <strong>选词填空</strong>
        <span>
          词性与上下文搭配 <ArrowRight size={13} aria-hidden />
        </span>
      </Link>
      <Link href="/practice/daily?type=matching">
        <strong>长篇阅读</strong>
        <span>
          定位与同义替换 <ArrowRight size={13} aria-hidden />
        </span>
      </Link>
    </section>
  );
}

interface WeeklyStats {
  this_week_words: number;
  this_week_minutes: number;
  this_week_videos: number;
}

function WeeklyEntry() {
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    api<WeeklyStats>("/api/v1/learning/stats/weekly", { signal: controller.signal })
      .then((data) => setStats(data))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <section className="home-weekly" aria-label="本周记录">
      {failed ? (
        <Button variant="ghost" size="compact" onClick={() => setRetry((value) => value + 1)}>
          重试本周记录
        </Button>
      ) : stats ? (
        <p>
          本周听了 <strong>{stats.this_week_minutes} 分钟</strong> · 记了 {stats.this_week_words}{" "}
          个词 · 看完 {stats.this_week_videos} 段
        </p>
      ) : (
        <p>正在读取本周记录…</p>
      )}
      <Link href="/history">
        全部记录 <ArrowRight size={12} aria-hidden />
      </Link>
    </section>
  );
}
