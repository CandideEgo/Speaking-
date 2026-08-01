"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Layers,
  Clock,
  Flame,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ArrowRight,
} from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePlan } from "@/hooks/usePlan";
import { usePlatformFeed } from "@/hooks/usePlatformFeed";
import { Image } from "@/components/ui/Image";
import { EXAM_LEVELS, levelDotClass } from "@/lib/examLevels";
import { cn } from "@/lib/utils";
import { SAMPLE_WRONGS, SAMPLE_REAL_PAPERS, type RealPaper } from "@/data/practicePaper";
import type { VideoItem } from "@/types/platform";

/** 6 个练习层级（与原型 08 一致；考研/GRE 暂不列入练习专题）。 */
const PRACTICE_LEVELS = EXAM_LEVELS.filter((l) =>
  ["zhongkao", "gaoKao", "cet4", "cet6", "ielts", "toefl"].includes(l.key)
);

/** 静态试卷属性（后端整卷能力就绪后替换）。 */
function paperMetaForVideo(video: VideoItem, idx: number) {
  const counts = [28, 32, 26, 40, 30, 36, 24, 34];
  const prog = [64, 0, 100, 30, 0, 15, 50, 0];
  return {
    qCount: counts[idx % counts.length],
    progress: prog[idx % prog.length],
  };
}

function levelLabelOf(video: VideoItem): string {
  // Map CEFR difficulty to a practice level label for the card tag.
  const dl = (video.difficulty_level ?? "").toUpperCase();
  if (dl.startsWith("A")) return "高考";
  if (dl.startsWith("B1")) return "四级";
  if (dl.startsWith("B2")) return "六级";
  if (dl.startsWith("C")) return "雅思";
  return "四级";
}

function PracticeVideoCard({ video, idx }: { video: VideoItem; idx: number }) {
  const { qCount, progress } = paperMetaForVideo(video, idx);
  const done = progress >= 100;
  const levelLabel = levelLabelOf(video);

  return (
    <div className="group flex flex-col bg-canvas border border-hairline rounded-lg overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lift hover:border-transparent">
      {/* Thumb */}
      <div className="relative aspect-video bg-surface-card overflow-hidden">
        {video.thumbnail_url ? (
          <Image
            src={video.thumbnail_url}
            alt={video.title}
            fill
            sizes="320px"
            className="object-cover"
          />
        ) : null}
        <span className="absolute top-2 left-2 text-[11px] font-semibold text-on-primary px-2 py-0.5 rounded-pill bg-black/45 backdrop-blur-sm">
          {levelLabel}
        </span>
        <Link
          href={`/practice/exam?videoId=${video.id || video.video_id}&level=${PRACTICE_LEVELS.find((l) => l.label === levelLabel)?.key ?? "cet4"}`}
          onClick={(e) => e.stopPropagation()}
          title="考试模式（提交判分）"
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-pill bg-black/60 backdrop-blur-sm text-white text-[11px] font-semibold hover:bg-brand-500 transition-colors"
        >
          <Clock size={11} />
          考试
        </Link>
        <span className="absolute bottom-2 right-2 text-[11px] font-semibold font-mono text-white bg-black/70 px-1.5 py-0.5 rounded">
          {video.duration ? formatDur(video.duration) : ""}
        </span>
      </div>

      {/* Body */}
      <Link
        href={`/practice/paper/${video.id || video.video_id}`}
        className="flex flex-col gap-2 p-3.5 flex-1"
      >
        <div className="text-sm font-semibold text-ink leading-snug line-clamp-2 group-hover:text-brand-600 transition-colors">
          {video.title}
        </div>
        <div className="flex items-center gap-2.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1 font-medium">
            <CheckCircle2 size={13} />
            {qCount} 题
          </span>
          <span>·</span>
          <span>{levelLabel}格式</span>
        </div>
        <div className="mt-1">
          <div className="h-1 rounded-full bg-surface-card overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-muted-soft mt-1">
            <span>{done ? "已完成" : progress > 0 ? `已做 ${progress}%` : "未开始"}</span>
            <span>{done ? "复习" : "继续"}</span>
          </div>
        </div>
        <div className="mt-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md bg-ink text-canvas text-[13px] font-semibold group-hover:bg-brand-500 transition-colors">
          {done ? "再练一次" : "进入专栏"}
          <ArrowRight size={14} />
        </div>
      </Link>
    </div>
  );
}

function formatDur(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function RealPaperCard({ r }: { r: RealPaper }) {
  return (
    <div className="relative bg-canvas border border-hairline rounded-lg p-5 overflow-hidden hover:-translate-y-0.5 hover:shadow-lift transition-all">
      <div className="absolute top-0 left-0 right-0 h-1 bg-brand-500" />
      <div className="flex items-center gap-3 mb-3.5">
        <div
          className={cn(
            "w-11 h-11 rounded-md flex items-center justify-center text-white font-extrabold flex-shrink-0",
            r.logoBg,
            r.logo.length > 2 ? "text-xs" : "text-xl"
          )}
        >
          {r.logo}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-ink">{r.name}</div>
          <div className="text-xs text-muted mt-0.5">{r.sub}</div>
        </div>
      </div>
      <div className="flex gap-4 py-3 border-t border-b border-hairline mb-3.5">
        <div>
          <div className="text-lg font-bold font-mono text-ink">{r.sets}</div>
          <div className="text-[11px] text-muted mt-0.5">套题</div>
        </div>
        <div>
          <div className="text-lg font-bold font-mono text-ink">{r.q}</div>
          <div className="text-[11px] text-muted mt-0.5">题目</div>
        </div>
        <div>
          <div className="text-lg font-bold font-mono text-ink">--</div>
          <div className="text-[11px] text-muted mt-0.5">已做</div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-warning bg-warning-soft px-2.5 py-1 rounded-pill inline-flex items-center gap-1">
          <AlertCircle size={11} />
          即将上线
        </span>
        <span className="text-[13px] font-semibold text-muted-soft">敬请期待</span>
      </div>
    </div>
  );
}

export default function PracticeHubPage() {
  const { progress } = usePlan();
  const streak = progress?.current_streak ?? 0;
  const [activeLevel, setActiveLevel] = useState<string>("all");

  const { videos, loading } = usePlatformFeed({ platform: "home" });

  return (
    <PageTransition>
      <main className="container-page py-7 pb-24">
        {/* 页头 */}
        <PageHeader
          crumb="练习"
          title="练习专题"
          description="按考试层级生成的视频试卷，与四六级、雅思、托福真题试卷汇集一处。每完成一份试卷，对应词汇的掌握度自动更新。"
        />
        <div className="flex gap-6 flex-wrap -mt-2 mb-7">
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            连续学习 <strong className="text-lg font-bold text-ink font-mono">{streak}</strong> 天
          </div>
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <span className="w-2 h-2 rounded-full bg-success" />
            本月完成 <strong className="text-lg font-bold text-ink font-mono">12</strong> 份
          </div>
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <span className="w-2 h-2 rounded-full bg-indigo" />
            平均正确率 <strong className="text-lg font-bold text-ink font-mono">83%</strong>
          </div>
        </div>

        {/* 层级筛选 */}
        <div className="sticky top-16 z-20 bg-surface-soft/92 backdrop-blur border-b border-hairline py-3.5 mb-7">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <span className="text-xs font-semibold text-muted-soft uppercase tracking-wider mr-1 flex-shrink-0">
              层级
            </span>
            <button
              onClick={() => setActiveLevel("all")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill text-[13px] font-medium border transition-colors flex-shrink-0",
                activeLevel === "all"
                  ? "bg-ink text-canvas border-ink"
                  : "bg-canvas text-body border-hairline hover:border-ink"
              )}
            >
              全部
            </button>
            {PRACTICE_LEVELS.map((l) => (
              <button
                key={l.key}
                onClick={() => setActiveLevel(l.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill text-[13px] font-medium border transition-colors flex-shrink-0",
                  activeLevel === l.key
                    ? "bg-ink text-canvas border-ink"
                    : "bg-canvas text-body border-hairline hover:border-ink"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", levelDotClass(l.color))} />
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* 说明条 */}
        <div className="flex items-start gap-3 p-4 bg-brand-50 border border-brand-100 rounded-lg mb-7">
          <span className="w-8 h-8 rounded-md bg-brand-500 text-on-primary flex items-center justify-center flex-shrink-0">
            <Layers size={16} />
          </span>
          <div className="text-[13px] text-body leading-relaxed">
            <strong className="text-ink">视频试卷</strong>
            由视频字幕与考点词汇自动生成，按你选择的目标考试层级排版；
            <strong className="text-ink">真题试卷</strong>
            为四六级/雅思/托福历年原题，即将上线。点试卷卡进入专栏即时学习，或进入考试模式提交判分。
          </div>
        </div>

        {/* 水平检测特色卡 */}
        <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-0 bg-gradient-to-br from-[#161616] to-[#0a0a0a] rounded-xl overflow-hidden mb-8 text-[#fafafa]">
          <div className="p-7 sm:p-[30px] relative z-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-pill bg-[rgba(255,122,69,0.15)] text-[#ff7a45] uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              每日水平检测
            </span>
            <div className="text-[22px] font-extrabold tracking-tight mt-3 mb-1.5">
              今天，直接来一套卷子
            </div>
            <div className="text-[13px] text-[rgba(250,250,250,0.65)] leading-relaxed max-w-[42ch]">
              不看视频，直接做题。系统按你的目标层级出一张卷子，提交后给出对错、解析与得分——每天打开
              App 的第一件事，检验学习成果。
            </div>
            <Link
              href={`/practice/exam?level=${activeLevel === "all" ? "cet4" : activeLevel}`}
              className="inline-flex items-center gap-2 mt-5 px-6 py-2.5 rounded-md bg-brand-500 text-on-primary text-sm font-semibold shadow-brand hover:bg-brand-600 hover:-translate-y-0.5 transition-all"
            >
              <Clock size={15} />
              开始今日检测
            </Link>
          </div>
          <div className="p-6 bg-[rgba(255,255,255,0.03)] border-t sm:border-t-0 sm:border-l border-[rgba(255,255,255,0.08)] flex flex-col justify-center gap-3.5">
            <div className="flex items-center justify-between text-[13px] text-[rgba(250,250,250,0.6)]">
              <span>上次成绩</span>
              <strong className="text-base font-bold font-mono text-white">78 / 100</strong>
            </div>
            <div className="flex items-center justify-between text-[13px] text-[rgba(250,250,250,0.6)]">
              <span>本周检测</span>
              <strong className="text-base font-bold font-mono text-white">5 次</strong>
            </div>
            <div className="flex items-center justify-between text-[13px] text-[rgba(250,250,250,0.6)]">
              <span>连续打卡</span>
              <span className="inline-flex items-center gap-1.5">
                <Flame size={18} className="text-brand-500" />
                <strong className="text-base font-bold font-mono text-white">{streak}</strong> 天
              </span>
            </div>
          </div>
        </div>

        {/* 错题本 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2.5">
              错题本
              <span className="text-[13px] font-medium text-muted-soft font-mono">
                {SAMPLE_WRONGS.length} 题待重做
              </span>
            </h2>
            <Link
              href={`/practice/exam?level=${activeLevel === "all" ? "cet4" : activeLevel}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-ink text-canvas text-[13px] font-semibold hover:bg-brand-500 transition-colors"
            >
              <RotateCw size={14} />
              重做全部错题
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {SAMPLE_WRONGS.map((w, i) => (
              <div
                key={i}
                className="flex items-center gap-3.5 bg-canvas border border-hairline rounded-xl px-4 py-3 hover:bg-surface-soft transition-colors"
              >
                <span className="text-[11px] font-semibold text-error bg-red-soft px-2.5 py-0.5 rounded-pill flex-shrink-0">
                  {w.type}
                </span>
                <span className="flex-1 min-w-0 text-[13px] text-ink whitespace-nowrap overflow-hidden text-ellipsis">
                  {w.stem}
                </span>
                <span className="text-[11px] text-muted-soft flex-shrink-0 hidden sm:inline">
                  来自《{w.from}》
                </span>
                <Link
                  href={`/practice/exam?level=${activeLevel === "all" ? "cet4" : activeLevel}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-surface-card text-ink text-xs font-semibold hover:bg-brand-500 hover:text-on-primary transition-colors flex-shrink-0"
                >
                  重做
                  <ChevronRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* 视频试卷 */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2.5">
              视频试卷
              <span className="text-[13px] font-medium text-muted-soft font-mono">
                本站视频生成
              </span>
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((v, i) => (
              <PracticeVideoCard key={v.id || v.video_id} video={v} idx={i} />
            ))}
            {loading &&
              videos.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-canvas border border-hairline rounded-lg overflow-hidden animate-pulse"
                >
                  <div className="aspect-video bg-surface-card" />
                  <div className="p-3.5 space-y-2">
                    <div className="h-4 bg-surface-card rounded w-3/4" />
                    <div className="h-3 bg-surface-card rounded w-1/2" />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* 真题试卷 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2.5">
              真题试卷
              <span className="text-[13px] font-medium text-muted-soft font-mono">
                历年原题 · 即将上线
              </span>
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {SAMPLE_REAL_PAPERS.map((r) => (
              <RealPaperCard key={r.name} r={r} />
            ))}
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
