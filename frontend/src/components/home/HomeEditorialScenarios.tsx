"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { ArrowUpRight, Play } from "lucide-react";
import { homeScenarioCards } from "@/lib/homeScenarios";
import type { VideoLearningMetadata } from "@/hooks/useVideoMetadata";
import { watchSentenceHref } from "@/lib/watchEntry";
import type {
  HomeEditorialContent,
  HomeEditorialScenario,
  HomeEditorialScenarioSlot,
} from "@/types/homeContent";

/**
 * 「今天就能用」：场景 + 可直接说出口的英文 + 中文解释。
 *
 * 只显示编辑场景（有真实字幕锚点）；没有编辑场景时不拿原句硬凑，避免和
 * 今日任务的句子重复。点卡片跳到本片对应句并播放，和任务主按钮的落点不同。
 */
export function HomeEditorialScenarios({
  scenarios,
  videoId,
  content,
}: {
  scenarios: HomeEditorialScenarioSlot[];
  videoId: string;
  content?: HomeEditorialContent;
  metadata?: VideoLearningMetadata;
}): ReactElement | null {
  const cards = homeScenarioCards({ videoId, scenarios, content }).filter(
    (card) => card.kind === "scenario"
  );
  if (!cards.length) return null;
  return (
    <section id="home-scenarios" aria-label="今天就能用" className="mt-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-title font-bold tracking-tight text-ink">今天就能用</h2>
        <p className="text-meta text-muted">把这段里的说法放进真实场景</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map(({ key, scenario }) => (
          <ScenarioCard key={key} scenario={scenario} videoId={videoId} />
        ))}
      </div>
    </section>
  );
}

function ScenarioCard({
  scenario,
  videoId,
}: {
  scenario: HomeEditorialScenario;
  videoId?: string;
}): ReactElement {
  const sentence = scenario.sentence;
  const href =
    sentence && videoId
      ? watchSentenceHref(
          videoId,
          { from: "home" },
          {
            subtitleId: sentence.subtitle_id,
            startTime: sentence.start_time,
            autoplay: true,
          }
        )
      : null;

  const body = (
    <>
      <span className="text-meta font-semibold text-brand-700">{scenario.situation_zh}</span>
      <strong className="mt-1 line-clamp-3 text-copy-lg font-bold leading-snug text-ink">
        {scenario.reply_en}
      </strong>
      {scenario.reply_zh && (
        <span className="mt-1 line-clamp-2 text-meta leading-relaxed text-body">
          {scenario.reply_zh}
        </span>
      )}
      {sentence && (
        <span className="mt-3 inline-flex items-center gap-1 text-meta font-semibold text-brand-700">
          <Play size={13} fill="currentColor" aria-hidden />
          在原片 {formatSeconds(sentence.start_time)} 听这句
          <ArrowUpRight size={12} aria-hidden />
        </span>
      )}
    </>
  );

  if (href && sentence) {
    return (
      <article aria-label={scenario.situation_zh}>
        <Link
          href={href}
          aria-label={`${scenario.situation_zh}：${sentence.text_en}，跳转到原视频 ${formatSeconds(
            sentence.start_time
          )} 并播放`}
          className="flex h-full min-h-[10rem] flex-col rounded-md border border-hairline bg-canvas p-4 transition-colors hover:border-hairline-strong hover:bg-surface-soft"
        >
          {body}
        </Link>
      </article>
    );
  }
  return (
    <article
      aria-label={scenario.situation_zh}
      className="flex h-full min-h-[10rem] flex-col rounded-md border border-hairline bg-canvas p-4"
    >
      {body}
    </article>
  );
}

function formatSeconds(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
