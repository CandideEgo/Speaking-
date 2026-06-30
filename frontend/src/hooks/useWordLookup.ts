"use client";

import { useState, useCallback } from "react";
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
      setWordGloss(null);
      speakWord(clean);
      try {
        const subtitles = getSubtitles();
        // Use word-boundary regex to avoid substring matches (e.g. "act" in "actually")
        const wordRe = new RegExp(`\\b${clean}\\b`, "i");
        const ctx = subtitles?.find((s) => wordRe.test(s.text_en));
        const params = new URLSearchParams({ word: clean });
        if (ctx?.text_en) params.set("context_sentence", ctx.text_en);
        if (videoId) params.set("video_id", videoId);
        const res = await api<WordGloss>(
          `/api/v1/words/gloss?${params.toString()}`,
        );
        setWordGloss(res);
      } catch {
        setWordGloss(null);
        toast.error("单词查询失败");
      }
    },
    [selectedWord, clearWord, speakWord, getSubtitles, videoId],
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
      toast.success(`"${selectedWord}" 已保存到词汇本`);
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
