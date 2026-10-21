"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useSpeech } from "@/hooks/useSpeech";
import type { Subtitle, WordGloss } from "@/types";

interface Options {
  requireAuth: () => boolean;
  videoId: string;
}

/** Capture context at the click; never search a video for the first same word. */
export function useWordLookup({ requireAuth, videoId }: Options) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordGloss, setWordGloss] = useState<WordGloss | null>(null);
  const [context, setContext] = useState<Subtitle | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [enrichmentError, setEnrichmentError] = useState(false);
  const requestRef = useRef(0);
  const selectionRef = useRef<{ word: string; context: Subtitle | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { speak: speakWord, stop: stopWordSpeech } = useSpeech({ rate: 1 });

  const cancelPending = useCallback(() => {
    requestRef.current++;
    abortRef.current?.abort();
  }, []);
  const clearWord = useCallback(() => {
    cancelPending();
    selectionRef.current = null;
    setSelectedWord(null);
    setWordGloss(null);
    setContext(null);
    setLookupError(null);
    setEnrichmentError(false);
    stopWordSpeech();
  }, [stopWordSpeech, cancelPending]);

  useEffect(() => {
    clearWord();
    return cancelPending;
  }, [videoId, clearWord, cancelPending]);

  const handleWordClick = useCallback(
    async (word: string, source: Subtitle | null = null) => {
      const clean = word.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
      if (!clean) return;
      const request = ++requestRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      selectionRef.current = { word: clean, context: source };
      setSelectedWord(clean);
      setContext(source);
      setWordGloss(null);
      setLookupError(null);
      setEnrichmentError(false);
      stopWordSpeech();
      let base: WordGloss;
      try {
        base = await api<WordGloss>(
          `/api/v1/words/gloss/static?${new URLSearchParams({ word: clean })}`,
          { signal: controller.signal }
        );
        if (request !== requestRef.current) return;
        setWordGloss(base);
      } catch {
        if (request === requestRef.current) setLookupError("单词查询失败，请重试");
        return;
      }
      try {
        const params = new URLSearchParams({ word: clean, lemma: base.lemma ?? clean });
        if (source) {
          params.set("subtitle_id", source.id);
          params.set("context_sentence", source.text_en);
        }
        if (videoId) params.set("video_id", videoId);
        const enrich = await api<WordGloss>(`/api/v1/words/gloss/enrich?${params}`, {
          signal: controller.signal,
        });
        if (request !== requestRef.current) return;
        setWordGloss({
          ...base,
          example_sentence: enrich.example_sentence,
          example_sentence_zh: enrich.example_sentence_zh,
          example_source: enrich.example_source,
          is_high_freq: enrich.is_high_freq,
          contextual_note: enrich.contextual_note,
          note_scope: enrich.note_scope,
          pitfalls: enrich.pitfalls,
          knowledge: enrich.knowledge,
        });
      } catch {
        if (request === requestRef.current) setEnrichmentError(true);
      }
    },
    [videoId, stopWordSpeech]
  );

  const retryLookup = useCallback(() => {
    const current = selectionRef.current;
    if (current) void handleWordClick(current.word, current.context);
  }, [handleWordClick]);

  const saveToVocabulary = useCallback(async () => {
    const selected = selectionRef.current;
    if (!selected || !requireAuth()) return;
    const params = new URLSearchParams({ word: selected.word });
    if (videoId) params.set("video_id", videoId);
    if (selected.context) {
      params.set("subtitle_id", selected.context.id);
      params.set("context_sentence", selected.context.text_en);
    }
    try {
      await api(`/api/v1/vocabulary?${params}`, { method: "POST" });
      toast.success(`"${selected.word}" 已保存到词库`);
    } catch {
      toast.error("保存失败，请检查原句是否仍可访问");
    }
  }, [requireAuth, videoId]);

  return {
    selectedWord,
    wordGloss,
    context,
    lookupError,
    enrichmentError,
    retryLookup,
    handleWordClick,
    saveToVocabulary,
    speakWord,
    stopWordSpeech,
    clearWord,
  };
}
