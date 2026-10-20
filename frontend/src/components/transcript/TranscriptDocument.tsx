"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Copy, Eye, EyeOff, Play, ScrollText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { displayLevel, levelDotClass, wordHighlightClass } from "@/lib/examLevels";
import { formatDuration, formatTime } from "@/lib/format";
import {
  buildTranscriptSections,
  buildWordIndex,
  countTranscriptWords,
  splitSentenceTokens,
  sectionSnippet,
  type TranscriptSection,
  type TranscriptWord,
} from "@/lib/transcriptDoc";
import { cn } from "@/lib/utils";
import { watchHref, watchSentenceHref } from "@/lib/watchEntry";
import type { Subtitle, VideoDetail } from "@/types";

/** 右栏「考试词」最多列这么多条（索引已按等级与出现次数排好）。 */
const RAIL_WORD_LIMIT = 24;

/**
 * 全文文稿（`/watch/{id}/transcript`）：把一整段视频的字幕按「文档」排版。
 *
 * 和观看页的关系：观看页只显示当前一句，这里补的是「整段可读、可扫」的那一面。
 * 每条句子左侧时间是入口——点一下回到播放器并从那一句开始；句中的考试词带虚线下划线，
 * 点词同样回播放器并直接打开词卡（`?sub=…&word=…` 深链）。右侧目录与考试词索引只负责
 * 定位，不改变阅读位置以外的任何状态。
 *
 * 数据只有一次请求：`GET /videos/{id}` 本来就带全部字幕（观看页用的同一个响应）。
 */
export function TranscriptDocument() {
  const { id } = useParams<{ id: string }>();
  // Next 已经把路由参数解码过，这里直接用；拼 API / 链接时再 encode。
  const videoId = id;

  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [showZh, setShowZh] = useState(true);
  const [copied, setCopied] = useState(false);
  /** 被「考试词索引」定位到的句子的 `sentence_index`，短暂高亮一下。 */
  const [flash, setFlash] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setVideo(null);
    api<VideoDetail>(`/api/v1/videos/${encodeURIComponent(videoId)}`, {
      signal: controller.signal,
    })
      .then((data) => setVideo(data))
      .catch((err) => {
        if (!controller.signal.aborted) setError(apiErrorMessage(err, "文稿加载失败"));
      });
    return () => controller.abort();
  }, [videoId, retry]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );

  const subtitles = useMemo(
    () => [...(video?.subtitles ?? [])].sort((a, b) => a.sentence_index - b.sentence_index),
    [video]
  );
  const sections = useMemo(() => buildTranscriptSections(subtitles), [subtitles]);
  const words = useMemo(() => buildWordIndex(subtitles), [subtitles]);
  const wordCount = useMemo(() => countTranscriptWords(subtitles), [subtitles]);

  const watchUrl = watchHref(videoId, { from: "transcript" });

  /** 滚到某一句并短暂高亮——目录/考试词索引共用。 */
  const jumpToSentence = useCallback((sentenceIndex: number) => {
    const target = document.getElementById(`transcript-${sentenceIndex}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(sentenceIndex);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1600);
  }, []);

  const copyAll = useCallback(async () => {
    if (!video) return;
    const body = subtitles
      .map((s) => `[${formatTime(s.start_time)}] ${s.text_en}${s.text_zh ? `\n${s.text_zh}` : ""}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(`${video.title}\n\n${body}`);
      setCopied(true);
      toast.success("已复制全文");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请手动选择文本");
    }
  }, [subtitles, video]);

  if (error) {
    return (
      <PageFrame>
        <BackHome />
        <ErrorState
          className="py-16"
          title="文稿加载失败"
          message={error}
          onRetry={() => setRetry((n) => n + 1)}
        />
      </PageFrame>
    );
  }

  if (!video) {
    return (
      <PageFrame>
        <BackHome />
        <div className="mt-6 space-y-3" aria-hidden>
          <div className="h-3 w-14 animate-pulse rounded-sm bg-surface-soft" />
          <div className="h-8 w-2/3 animate-pulse rounded-sm bg-surface-soft" />
          <div className="h-3 w-1/3 animate-pulse rounded-sm bg-surface-soft" />
          <div className="space-y-4 pt-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded-sm bg-surface-soft" />
            ))}
          </div>
        </div>
      </PageFrame>
    );
  }

  const facts = [
    video.channel_name,
    video.difficulty_level,
    `完整 ${subtitles.length} 句`,
    video.duration ? formatDuration(video.duration) : null,
    wordCount > 0 ? `约 ${wordCount} 词` : null,
    words.length > 0 ? `${words.length} 个考试词` : null,
    video.wpm ? `语速 ${Math.round(video.wpm)} wpm` : null,
  ].filter(Boolean) as string[];
  return (
    <PageFrame>
      <BackHome />

      <header className="mt-4 border-b border-hairline pb-6">
        <p className="text-[0.6875rem] font-bold tracking-[0.11em] text-muted">全文文稿</p>
        <h1 className="mt-2 text-balance text-display-sm font-bold leading-[1.25] tracking-[-0.02em] text-ink">
          {video.title}
        </h1>
        {facts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption tabular-nums text-muted">
            {facts.map((fact, i) => (
              <span key={`${fact}-${i}`} className="inline-flex items-center gap-3">
                {i > 0 && (
                  <span className="h-[3px] w-[3px] rounded-full bg-hairline-strong" aria-hidden />
                )}
                {fact}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowZh((v) => !v)}
            aria-pressed={showZh}
            icon={showZh ? EyeOff : Eye}
          >
            {showZh ? "隐藏译文" : "显示译文"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copyAll}
            icon={copied ? Check : Copy}
            aria-label="复制全文"
          >
            {copied ? "已复制" : "复制全文"}
          </Button>
          <LinkButton href={watchUrl} variant="tonal" size="sm" icon={Play}>
            回到视频
          </LinkButton>
        </div>

        <p className="mt-3 text-caption leading-relaxed text-muted">
          点句首时间从那一句开始播放；带虚线的词是考试词，点开可看释义。
        </p>
      </header>

      {subtitles.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="这段视频还没有文稿"
          description="字幕处理完成后，整段文稿会出现在这里。"
          action={
            <LinkButton href={watchUrl} variant="outline" size="sm">
              回到视频
            </LinkButton>
          }
        />
      ) : (
        <>
          <div className="mt-2 grid gap-10 xl:grid-cols-[minmax(0,1fr)_15rem] xl:gap-12">
            <div className="mx-auto w-full min-w-0 max-w-[46rem]">
              {sections.map((section) => (
                <SectionBlock
                  key={section.index}
                  section={section}
                  videoId={videoId}
                  showZh={showZh}
                  flash={flash}
                />
              ))}
            </div>

            {/* 目录 / 考试词只在 xl 出现：1024 的壳里正文只剩 ~480px，加右栏会把
                一行挤成短句。栏位在 grid 里拉伸到正文高度，里面的 sticky 才有吸附行程。 */}
            <aside className="hidden xl:block">
              <div className="custom-scrollbar xl:sticky xl:top-6 xl:max-h-[calc(100dvh-9rem)] xl:overflow-y-auto xl:pr-1">
                <TableOfContents sections={sections} onJump={jumpToSentence} />
                <WordIndexPanel words={words} onJump={jumpToSentence} />
              </div>
            </aside>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-hairline pt-6">
            <LinkButton href={watchUrl} variant="tonal" size="md" icon={Play}>
              回到视频
            </LinkButton>
            <LinkButton href="/" variant="outline" size="md">
              返回首页
            </LinkButton>
            <p className="ml-auto text-caption text-muted">字幕由 AI 转写，可能存在个别差错。</p>
          </div>
        </>
      )}
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-18 pt-6">
      <div className="mx-auto w-full max-w-[64rem]">{children}</div>
    </div>
  );
}

function BackHome() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-caption text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft size={13} aria-hidden />
      返回首页
    </Link>
  );
}

function SectionBlock({
  section,
  videoId,
  showZh,
  flash,
}: {
  section: TranscriptSection;
  videoId: string;
  showZh: boolean;
  flash: number | null;
}) {
  return (
    <section aria-labelledby={`transcript-section-${section.index}`} className="pt-6 first:pt-5">
      <h2
        id={`transcript-section-${section.index}`}
        className="flex items-baseline gap-2 text-caption tabular-nums text-muted"
      >
        <span className="font-bold tracking-[0.08em]">{formatTime(section.startTime)}</span>
        <span className="h-px flex-1 self-center bg-hairline" aria-hidden />
        <span>
          第 {section.index + 1} 段 · {section.sentences.length} 句
        </span>
      </h2>
      <ol className="mt-1">
        {section.sentences.map((sentence) => (
          <SentenceRow
            key={sentence.id}
            videoId={videoId}
            sentence={sentence}
            showZh={showZh}
            highlighted={flash === sentence.sentence_index}
          />
        ))}
      </ol>
    </section>
  );
}

function SentenceRow({
  videoId,
  sentence,
  showZh,
  highlighted,
}: {
  videoId: string;
  sentence: Subtitle;
  showZh: boolean;
  highlighted: boolean;
}) {
  const tokens = splitSentenceTokens(sentence.text_en, sentence.word_levels);
  // 句首时间是「回播放器、从这一句开始」的入口（不是页内跳转）；句中的考试词
  // 再带上 `word=`，落地即打开词卡。
  const playHref = watchSentenceHref(
    videoId,
    { from: "transcript" },
    {
      subtitleId: sentence.id,
    }
  );

  return (
    <li
      id={`transcript-${sentence.sentence_index}`}
      className={cn(
        "scroll-mt-6 rounded-sm border-b border-hairline/70 px-2 py-3.5 transition-colors duration-300 last:border-b-0 hover:bg-surface-soft/70",
        highlighted && "bg-brand-50 hover:bg-brand-50"
      )}
    >
      <div className="flex items-start gap-3">
        <Link
          href={playHref}
          className="mt-[3px] w-10 shrink-0 text-left text-caption font-medium tabular-nums text-muted transition-colors hover:text-brand-700"
          aria-label={`从 ${formatTime(sentence.start_time)} 开始播放`}
        >
          {formatTime(sentence.start_time)}
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-copy-lg leading-[1.75] text-ink">
            {tokens.map((token, i) =>
              token.levels && token.key ? (
                <Link
                  key={i}
                  href={watchSentenceHref(
                    videoId,
                    { from: "transcript" },
                    {
                      subtitleId: sentence.id,
                      word: token.key,
                    }
                  )}
                  className={cn(
                    "transition-colors hover:bg-brand-100",
                    wordHighlightClass(token.levels, null, { only: true })
                  )}
                  title={`${token.key} · ${displayLevel(token.levels)?.label ?? ""}`}
                >
                  {token.text}
                </Link>
              ) : (
                <span key={i}>{token.text}</span>
              )
            )}
          </p>
          {showZh && sentence.text_zh && (
            <p className="mt-1 text-copy leading-[1.7] text-muted">{sentence.text_zh}</p>
          )}
        </div>
      </div>
    </li>
  );
}

function TableOfContents({
  sections,
  onJump,
}: {
  sections: TranscriptSection[];
  onJump: (sentenceIndex: number) => void;
}) {
  return (
    <nav aria-label="文稿目录">
      <h2 className="text-caption font-bold tracking-[0.08em] text-muted">目录</h2>
      <ul className="mt-2">
        {sections.map((section) => (
          <li key={section.index}>
            <button
              type="button"
              onClick={() => onJump(section.sentences[0].sentence_index)}
              className="flex w-full items-baseline gap-2 rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-surface-soft"
            >
              <span className="shrink-0 text-caption tabular-nums text-muted">
                {formatTime(section.startTime)}
              </span>
              <span className="truncate text-meta text-body">{sectionSnippet(section)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function WordIndexPanel({
  words,
  onJump,
}: {
  words: TranscriptWord[];
  onJump: (sentenceIndex: number) => void;
}) {
  // 索引已经按「等级高 → 出现多 → 出现早」排好，长视频可能有几百个考试词；
  // 只列最靠前的这些，避免右栏变成长列表（全部词仍在正文里带下划线可点）。
  const shown = words.slice(0, RAIL_WORD_LIMIT);

  return (
    <section aria-labelledby="transcript-vocab-title" className="mt-7">
      <div className="flex items-baseline justify-between gap-2">
        <h2
          id="transcript-vocab-title"
          className="text-caption font-bold tracking-[0.08em] text-muted"
        >
          考试词
        </h2>
        <span className="text-caption tabular-nums text-muted">{words.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 px-1.5 text-caption leading-relaxed text-muted">
          这段视频没有标注考试词。
        </p>
      ) : (
        <ul className="mt-2">
          {shown.map((word) => {
            const level = displayLevel(word.levels);
            return (
              <li key={word.key}>
                <button
                  type="button"
                  onClick={() => onJump(word.firstSentenceIndex)}
                  className="flex w-full items-baseline gap-2 rounded-sm px-1.5 py-[3px] text-left transition-colors hover:bg-surface-soft"
                  aria-label={`定位到 ${word.label} 第一次出现`}
                >
                  <span className="truncate text-meta font-medium text-ink">{word.label}</span>
                  <span className="shrink-0 text-caption tabular-nums text-muted">
                    ×{word.count}
                  </span>
                  {level && (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[0.6875rem] text-muted">
                      <span
                        className={cn("h-[5px] w-[5px] rounded-full", levelDotClass(level.color))}
                        aria-hidden
                      />
                      {level.label}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 px-1.5 text-caption leading-relaxed text-muted">
        {words.length > shown.length
          ? `共 ${words.length} 个，按等级列出前 ${shown.length} 个；点词条定位到那一句。`
          : "点词条定位到那一句。"}
      </p>
    </section>
  );
}
