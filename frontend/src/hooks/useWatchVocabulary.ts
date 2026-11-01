"use client";

/**
 * 观看页的词汇侧读模型（FE-06 提取点）。
 *
 * 页面原先自己管三份词汇状态：正在学/复习中的词、已掌握的词、本视频是否已
 * 生成过筛集合，再把它们喂给字幕着色函数。这里把「取数与写操作」收成一个
 * hook，页面只拿到 `levelClassFor` 与「加入学习」动作。
 *
 * 着色规则本身在 `lib/watchWordHighlight.ts`（纯函数，有单测）。
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { wordHighlightClassFor } from "@/lib/watchWordHighlight";
import type { VocabSet, VocabSetCreateResponse } from "@/types";

interface Options {
  videoId: string;
  isAuthenticated: boolean;
  requireAuth: () => boolean;
  selectedExamLevel: string | null;
  videoTitle: string | null | undefined;
  thumbnailUrl: string | null | undefined;
  /** 已存在集合时的出口（页面传 router.push，hook 不持有导航）。 */
  onOpenSet: (setId: string) => void;
}

interface WatchVocabulary {
  /** 正在学 / 复习中的词（字幕高亮最强档）。 */
  learningWords: Set<string>;
  /** 已掌握的词（只留虚线下划线）。 */
  masteredWords: Set<string>;
  /** 本视频的过筛集合；null 表示还没加入学习。 */
  vocabSet: VocabSet | null;
  addingVocabSet: boolean;
  /** 已加入 → 打开集合；未加入 → 创建并 toast。 */
  addVocabSet: () => Promise<void>;
  /** 字幕 token → 档位类名。 */
  levelClassFor: (word: string, wordLevels: Record<string, string[]> | null) => string;
}

export function useWatchVocabulary({
  videoId,
  isAuthenticated,
  requireAuth,
  selectedExamLevel,
  videoTitle,
  thumbnailUrl,
  onOpenSet,
}: Options): WatchVocabulary {
  const [learningWords, setLearningWords] = useState<Set<string>>(new Set());
  const [masteredWords, setMasteredWords] = useState<Set<string>>(new Set());
  const [vocabSet, setVocabSet] = useState<VocabSet | null>(null);
  const [addingVocabSet, setAddingVocabSet] = useState(false);

  // 正在学 / 复习中：字幕最强的「已收词」档。
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ words: string[] }>(
          "/api/v1/vocabulary/words?mastery=learning,reviewing"
        );
        if (!cancelled) setLearningWords(new Set(res.words));
      } catch {
        // non-fatal: 拿不到词表就不高亮，不挡播放。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // DEC-073：高亮四档里的「已掌握」要单独一次查询 —— 同一个端点按 mastery 过滤、
  // 只回词串，learning/reviewing 与 mastered 必须能区分开才谈得上降底色。
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ words: string[] }>("/api/v1/vocabulary/words?mastery=mastered");
        if (!cancelled) setMasteredWords(new Set(res.words));
      } catch {
        // non-fatal: 退化成一档，只是底色略多，不挡播放。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // 词汇集合：本视频是否已生成过筛集合（GET /vocab-sets 按 video_id 匹配）。
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const sets = await api<VocabSet[]>("/api/v1/vocab-sets");
        if (!cancelled) setVocabSet(sets.find((s) => s.video_id === videoId) ?? null);
      } catch {
        // non-fatal: 按钮保持「加入学习」态。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, videoId]);

  const addVocabSet = useCallback(async () => {
    if (!requireAuth()) return;
    if (vocabSet) {
      onOpenSet(vocabSet.id);
      return;
    }
    if (addingVocabSet) return;
    setAddingVocabSet(true);
    try {
      const res = await api<VocabSetCreateResponse>("/api/v1/vocab-sets", {
        method: "POST",
        body: JSON.stringify({
          video_id: videoId,
          ...(selectedExamLevel ? { exam_level: selectedExamLevel } : {}),
        }),
      });
      toast.success(res.message || "已加入学习");
      setVocabSet({
        id: res.id,
        video_id: res.video_id,
        exam_level: res.exam_level,
        title: videoTitle ?? "",
        thumbnail_url: thumbnailUrl ?? null,
        total: res.total,
        mastered_count: 0,
        last_activity_at: null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "加入失败，请重试"));
    } finally {
      setAddingVocabSet(false);
    }
  }, [
    requireAuth,
    vocabSet,
    onOpenSet,
    addingVocabSet,
    videoId,
    selectedExamLevel,
    videoTitle,
    thumbnailUrl,
  ]);

  const levelClassFor = useCallback(
    (word: string, wordLevels: Record<string, string[]> | null) =>
      wordHighlightClassFor(word, wordLevels, {
        selectedExamLevel,
        learningWords,
        masteredWords,
      }),
    [selectedExamLevel, learningWords, masteredWords]
  );

  return {
    learningWords,
    masteredWords,
    vocabSet,
    addingVocabSet,
    addVocabSet,
    levelClassFor,
  };
}
