'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useSpeech } from '@/hooks/useSpeech';
import type { Subtitle } from '@/types';

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
  wordMeaning: string | null;
  handleWordClick: (word: string) => void;
  saveToVocabulary: () => Promise<void>;
  speakWord: (text: string) => void;
  clearWord: () => void;
}

/**
 * Hook for word lookup state on the watch page.
 * Manages: selected word, meaning lookup, pronunciation, and vocabulary saving.
 */
export function useWordLookup({ requireAuth, getSubtitles, videoId }: UseWordLookupOptions): UseWordLookupReturn {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordMeaning, setWordMeaning] = useState<string | null>(null);
  const { speak: speakWord } = useSpeech({ rate: 1 });

  const clearWord = useCallback(() => {
    setSelectedWord(null);
    setWordMeaning(null);
  }, []);

  const handleWordClick = useCallback(async (word: string) => {
    const clean = word.replace(/[.,!?;:'"]/g, '');
    if (selectedWord === clean) {
      clearWord();
      return;
    }
    setSelectedWord(clean);
    setWordMeaning(null);
    speakWord(clean);
    try {
      const subtitles = getSubtitles();
      const ctx = subtitles?.find((s) => s.text_en.includes(clean));
      if (ctx) {
        const res = await api<{ meaning: string }>(
          `/api/v1/ai/word-lookup?word=${encodeURIComponent(clean)}&sentence=${encodeURIComponent(ctx.text_en)}`
        );
        setWordMeaning(res.meaning);
      }
    } catch {
      setWordMeaning('单词查询需要 Pro 订阅。');
    }
  }, [selectedWord, clearWord, speakWord, getSubtitles]);

  const saveToVocabulary = useCallback(async () => {
    if (!selectedWord || !requireAuth()) return;
    const subtitles = getSubtitles();
    const ctx = subtitles?.find((s) => s.text_en.includes(selectedWord));
    try {
      const params = new URLSearchParams({ word: selectedWord });
      if (ctx?.text_en) params.set('context_sentence', ctx.text_en);
      if (videoId) params.set('video_id', videoId);
      await api(`/api/v1/vocabulary?${params.toString()}`, { method: 'POST' });
      toast.success(`"${selectedWord}" 已保存到词汇本`);
    } catch {
      toast.error('保存失败');
    }
  }, [selectedWord, requireAuth, getSubtitles, videoId]);

  return {
    selectedWord,
    wordMeaning,
    handleWordClick,
    saveToVocabulary,
    speakWord,
    clearWord,
  };
}
