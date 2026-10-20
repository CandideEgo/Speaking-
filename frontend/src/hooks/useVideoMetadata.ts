"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** 样本句里「值得记的词」：词 + 音标 + 释义 + 考试级别 key（四级/六级… 由前端映射）。 */
export interface SampleWord {
  word: string;
  phonetic: string | null;
  translation: string | null;
  levels: string[];
}

export interface VideoLearningMetadata {
  subtitle_count: number;
  exam_word_count: number;
  sample_text_en: string | null;
  sample_text_zh: string | null;
  /** 后端 `learning_metadata` 追加；缺失时按空数组处理。 */
  sample_words?: SampleWord[];
  sample_subtitle_id?: string;
  sample_start_time?: number;
  sample_end_time?: number;
  sample_word_timestamps?: { word: string; start: number; end: number }[];
}

export function useVideoMetadata(videos: { id?: string; video_id?: string }[]) {
  const ids = videos
    .map((v) => v.id || v.video_id)
    .filter(Boolean)
    .join(",");
  const [data, setData] = useState<Record<string, VideoLearningMetadata>>({});
  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    const batches = ids.split(",");
    const requests = [];
    for (let start = 0; start < batches.length; start += 100) {
      requests.push(
        api<Record<string, VideoLearningMetadata>>(
          `/api/v1/discovery/learning-metadata?ids=${encodeURIComponent(batches.slice(start, start + 100).join(","))}`,
          { signal: controller.signal, cacheTtlMs: 60000 }
        )
      );
    }
    Promise.all(requests)
      .then((items) => setData(Object.assign({}, ...items)))
      .catch(() => {
        /* supplemental information is optional */
      });
    return () => controller.abort();
  }, [ids]);
  return data;
}
