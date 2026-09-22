"use client";

import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useSpeech } from "@/hooks/useSpeech";
import type { Subtitle, WordGloss } from "@/types";

interface UseWordLookupOptions {
  /** Called to navigate to login when auth is required. */
  requireAuth: () => boolean;
  /** Subtitle list to search for context sentences. */
  getSubtitles: () => Subtitle[] | undefined;
  /** Video ID for vocabulary saving. */
  videoId: string;
}

interface UseWordLookupReturn {
  selectedWord: string | null;
  wordGloss: WordGloss | null;
  handleWordClick: (word: string) => void;
  saveToVocabulary: () => Promise<void>;
  speakWord: (text: string) => void;
  clearWord: () => void;
}

/** 分级渲染第二级（/gloss/enrich）拥有的字段。
 *  合并时只覆盖这些，避免 enrich 响应里的空值污染第一级已展示的
 *  静态字段（词头/音标/词形/词典释义）。 */
function mergeEnrich(base: WordGloss, enrich: WordGloss): WordGloss {
  return {
    ...base,
    example_sentence: enrich.example_sentence,
    example_sentence_zh: enrich.example_sentence_zh,
    example_source: enrich.example_source,
    is_high_freq: enrich.is_high_freq,
    contextual_note: enrich.contextual_note,
    pitfalls: enrich.pitfalls,
    knowledge: enrich.knowledge,
  };
}

/**
 * Hook for word lookup state on the watch page.
 * Manages: selected word, gloss lookup (ECDICT + AI contextual notes),
 * pronunciation, and vocabulary saving.
 */
export function useWordLookup({
  requireAuth,
  getSubtitles,
  videoId,
}: UseWordLookupOptions): UseWordLookupReturn {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordGloss, setWordGloss] = useState<WordGloss | null>(null);
  // 竞态守卫：用户快速连续点击不同单词时，丢弃过期响应，防止旧词的
  // 第二级结果合并进新词的词卡。
  const lastClickedRef = useRef<string | null>(null);
  const { speak: speakWord } = useSpeech({ rate: 1 });

  const clearWord = useCallback(() => {
    setSelectedWord(null);
    setWordGloss(null);
  }, []);

  const handleWordClick = useCallback(
    async (word: string) => {
      const clean = word.replace(/[.,!?;:'"]/g, "");
      if (selectedWord === clean) {
        clearWord();
        return;
      }
      setSelectedWord(clean);
      lastClickedRef.current = clean;
      setWordGloss(null);
      speakWord(clean);
      const subtitles = getSubtitles();
      // Use word-boundary regex to avoid substring matches (e.g. "act" in "actually")
      const wordRe = new RegExp(`\\b${clean}\\b`, "i");
      const ctx = subtitles?.find((s) => wordRe.test(s.text_en));

      // 第一级：ECDICT 静态释义（内存查询，无 DB 往返）→ 词卡基础内容先渲染。
      let base: WordGloss;
      try {
        const staticParams = new URLSearchParams({ word: clean });
        base = await api<WordGloss>(`/api/v1/words/gloss/static?${staticParams.toString()}`);
        if (lastClickedRef.current !== clean) return; // 已点其他词，丢弃
        setWordGloss(base);
      } catch {
        if (lastClickedRef.current !== clean) return;
        setWordGloss(null);
        toast.error("单词查询失败");
        return;
      }

      // 第二级：真题例句 + 高频徽标 + AI 笔记（DB 查询）→ 后补进词卡。
      // 依赖第一级返回的 lemma（词形归一）；失败静默——基础释义已展示。
      try {
        const params = new URLSearchParams({ word: clean, lemma: base.lemma ?? clean });
        if (ctx?.text_en) params.set("context_sentence", ctx.text_en);
        if (videoId) params.set("video_id", videoId);
        const enrich = await api<WordGloss>(`/api/v1/words/gloss/enrich?${params.toString()}`);
        if (lastClickedRef.current !== clean) return; // 已点其他词，丢弃
        setWordGloss((prev) => (prev ? mergeEnrich(prev, enrich) : enrich));
      } catch {
        // enrich 失败静默
      }
    },
    [selectedWord, clearWord, speakWord, getSubtitles, videoId]
  );

  const saveToVocabulary = useCallback(async () => {
    if (!selectedWord || !requireAuth()) return;
    const subtitles = getSubtitles();
    const wordRe = new RegExp(`\\b${selectedWord}\\b`, "i");
    const ctx = subtitles?.find((s) => wordRe.test(s.text_en));
    try {
      const params = new URLSearchParams({ word: selectedWord });
      if (ctx?.text_en) params.set("context_sentence", ctx.text_en);
      if (videoId) params.set("video_id", videoId);
      await api(`/api/v1/vocabulary?${params.toString()}`, { method: "POST" });
      toast.success(`"${selectedWord}" 已保存到词库`);
    } catch {
      toast.error("保存失败");
    }
  }, [selectedWord, requireAuth, getSubtitles, videoId]);

  return {
    selectedWord,
    wordGloss,
    handleWordClick,
    saveToVocabulary,
    speakWord,
    clearWord,
  };
}
