/**
 * 首页「今日学习任务」的纯数据视图模型。
 *
 * 编辑精选与普通精选各构建一次 HomeTask，页面只消费它：任务标题、中文收益、
 * 难度、片段真实时长和跳转位置都来自真实 DTO/字幕，组件不自己猜。
 */

import { formatDuration } from "@/lib/format";
import { clipDurationLabel, mediaSource, videoDurationLabel } from "@/lib/homeEditorial";
import { learningBenefit, videoLearningTheme } from "@/lib/learningBenefit";
import { watchHref, watchSentenceHref } from "@/lib/watchEntry";
import type { VideoLearningMetadata } from "@/hooks/useVideoMetadata";
import type { VideoCard } from "@/types";
import type { HomeEditorialVideoSlot } from "@/types/homeContent";

export interface HomeTaskSentence {
  text_en: string;
  text_zh: string | null;
  start_time: number;
  end_time: number;
  subtitle_id: string | null;
}

export interface HomeTaskClip {
  start: number;
  end: number;
  duration: number;
  subtitleId: string | null;
}

export interface HomeTask {
  video: VideoCard;
  headline: string;
  dek: string | null;
  /** 原片标题（编辑任务里作为次级信息；普通精选标题本身就是 headline）。 */
  videoTitle: string | null;
  themeLabel: string | null;
  sourceLabel: string | null;
  clip: HomeTaskClip | null;
  sentence: HomeTaskSentence | null;
  variant: "editorial" | "fallback";
}

function validSentence(sentence: HomeTaskSentence | null): sentence is HomeTaskSentence {
  return Boolean(
    sentence?.text_en?.trim() &&
    Number.isFinite(sentence.start_time) &&
    Number.isFinite(sentence.end_time) &&
    sentence.start_time >= 0 &&
    sentence.end_time > sentence.start_time
  );
}

/** 已发布编排 → 学习任务；片段时长若缺失/非法则退回完整视频，不显示假秒数。 */
export function editorialTask(slot: HomeEditorialVideoSlot): HomeTask {
  const { content, video } = slot;
  const clip = content.clip;
  const validClip =
    clip &&
    Number.isFinite(clip.start_time) &&
    Number.isFinite(clip.end_time) &&
    clip.start_time >= 0 &&
    clip.end_time > clip.start_time &&
    Number.isFinite(clip.duration) &&
    clip.duration > 0
      ? {
          start: clip.start_time,
          end: clip.end_time,
          duration: clip.duration,
          subtitleId: clip.start_subtitle_id || null,
        }
      : null;

  const rawSentence = content.expressions[0]?.sentence ?? content.sentences[0] ?? null;
  const sentence = rawSentence
    ? {
        text_en: rawSentence.text_en,
        text_zh: rawSentence.text_zh,
        start_time: rawSentence.start_time,
        end_time: rawSentence.end_time,
        subtitle_id: rawSentence.subtitle_id,
      }
    : null;

  return {
    video,
    headline: content.headline?.trim() || video.title,
    dek: content.dek?.trim() || null,
    videoTitle: video.title,
    themeLabel: content.topic_label || videoLearningTheme(video).label,
    sourceLabel: content.source_label || video.channel_name || null,
    clip: validClip && mediaSource(video) ? validClip : null,
    sentence: validSentence(sentence) ? sentence : null,
    variant: "editorial",
  };
}

/** 没有已发布编排时：用普通精选 + 学习元数据组织成同样结构的一个任务。 */
export function fallbackTask(video: VideoCard, metadata?: VideoLearningMetadata): HomeTask {
  const start = metadata?.sample_start_time;
  const end = metadata?.sample_end_time;
  const sentence =
    metadata?.sample_text_en &&
    typeof start === "number" &&
    typeof end === "number" &&
    start >= 0 &&
    end > start
      ? {
          text_en: metadata.sample_text_en,
          text_zh: metadata.sample_text_zh ?? null,
          start_time: start,
          end_time: end,
          subtitle_id: metadata.sample_subtitle_id ?? null,
        }
      : null;
  return {
    video,
    headline: video.title,
    dek: learningBenefit(video),
    videoTitle: null,
    themeLabel: videoLearningTheme(video).label,
    sourceLabel: video.channel_name || null,
    clip: null,
    sentence: validSentence(sentence) ? sentence : null,
    variant: "fallback",
  };
}

/** 主按钮文案与实际落点必须一致：有片段 → 听懂这段；无片段 → 从完整视频开始。 */
export function taskPrimaryAction(task: HomeTask): { href: string; label: string } {
  if (task.clip) {
    const duration = clipDurationLabel(task.clip.duration);
    return {
      href: watchSentenceHref(
        task.video.id,
        { from: "home" },
        {
          subtitleId: task.clip.subtitleId,
          startTime: task.clip.start,
          autoplay: true,
        }
      ),
      label: duration ? `听懂这段 · ${duration}` : "听懂这段",
    };
  }
  const full = formatDuration(task.video.duration);
  return {
    href: watchHref(task.video.id, { from: "home" }),
    label: full ? `从这段开始 · ${full}` : "从这段开始",
  };
}

export function taskFullVideoHref(task: HomeTask): string {
  return watchHref(task.video.id, { from: "home" });
}

export function taskFullVideoLabel(task: HomeTask): string | null {
  return videoDurationLabel(task.video.duration);
}
