"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { ArrowUpRight, Play } from "lucide-react";
import { homeScenarioCards } from "@/lib/homeScenarios";
import type { VideoLearningMetadata } from "@/hooks/useVideoMetadata";
import { watchSentenceHref } from "@/lib/watchEntry";
import { cn } from "@/lib/utils";
import type {
  HomeEditorialContent,
  HomeEditorialScenarioSlot,
  HomeEditorialSentence,
} from "@/types/homeContent";

/**
 * 「今天就能用」：只展示原片里真实存在的句子。
 *
 * 场景标签可以来自 AI 编排，但句子本身必须带 subtitle_id 与起止时间；AI
 * 写的 reply_en/reply_zh 不再出现在公共首页。点卡片跳到该句并播放。
 */
export function HomeEditorialScenarios({
  scenarios,
  videoId,
  content,
  metadata,
}: {
  scenarios: HomeEditorialScenarioSlot[];
  videoId: string;
  content?: HomeEditorialContent;
  metadata?: VideoLearningMetadata;
}): ReactElement | null {
  const [card] = homeScenarioCards({ videoId, scenarios, content, metadata });
  if (!card) return null;
  return (
    <section id="home-scenarios" aria-label="今天就能用" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-title font-bold tracking-tight text-ink">今天就能用</h2>
        <p className="text-meta text-muted">跳到原片，听清这句在语境里的意思</p>
      </div>
      <SceneSentenceCard
        videoId={videoId}
        sentence={card.scenario.sentence}
        label={card.scenario.situation_zh}
      />
    </section>
  );
}

/** 真实原句卡：英文原句 + 中文译文 + 跳转到该秒。今日任务的兜底也复用它。 */
export function SceneSentenceCard({
  videoId,
  sentence,
  label,
  className,
}: {
  videoId: string;
  sentence: HomeEditorialSentence | null | undefined;
  label: string;
  className?: string;
}): ReactElement | null {
  if (!isRenderableSentence(sentence)) return null;
  const href = watchSentenceHref(
    videoId,
    { from: "home" },
    {
      subtitleId: sentence.subtitle_id,
      startTime: sentence.start_time,
      autoplay: true,
    }
  );

  return (
    <article aria-label={label} className={cn("min-w-0", className)}>
      <Link
        href={href}
        aria-label={`${label}：${sentence.text_en}，跳转到原视频 ${formatSeconds(
          sentence.start_time
        )} 并播放`}
        className="flex h-full min-h-[10rem] flex-col rounded-md border border-hairline bg-canvas p-4 transition-colors hover:border-hairline-strong hover:bg-surface-soft"
      >
        <span className="text-meta font-semibold text-brand-700">{label}</span>
        <strong className="mt-1 line-clamp-3 text-copy-lg font-bold leading-snug text-ink">
          {sentence.text_en}
        </strong>
        {sentence.text_zh?.trim() && (
          <span className="mt-1 line-clamp-2 text-meta leading-relaxed text-body">
            {sentence.text_zh}
          </span>
        )}
        <span className="mt-auto pt-3 inline-flex items-center gap-1 text-meta font-semibold text-brand-700">
          <Play size={13} fill="currentColor" aria-hidden />
          在原片 {formatSeconds(sentence.start_time)} 听这句
          <ArrowUpRight size={12} aria-hidden />
        </span>
      </Link>
    </article>
  );
}

function isRenderableSentence(
  sentence: HomeEditorialSentence | null | undefined
): sentence is HomeEditorialSentence {
  return Boolean(
    sentence?.subtitle_id &&
    sentence.text_en.trim() &&
    Number.isFinite(sentence.start_time) &&
    Number.isFinite(sentence.end_time) &&
    sentence.start_time >= 0 &&
    sentence.end_time > sentence.start_time
  );
}

function formatSeconds(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
