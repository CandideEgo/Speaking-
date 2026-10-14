"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoachStep } from "@/components/common/CoachMark";

const STORAGE_KEY = "seeword_coach_done";
const FIRST_LESSON_STORAGE_KEY = "seeword_first_lesson_done";

/**
 * D2 CoachMark driver — advances a 4-step tour over the watch page.
 *
 * Steps:
 *   0. Subtitle area (auto-advance once the user clicks any word)
 *   1. Word card (auto-advance once the user adds the word to vocabulary)
 *   2. Practice area (final CTA → 了解)
 *   3. Centered "ready" message (no spotlight)
 *
 * The tour is gated behind a localStorage flag so it only runs once per
 * device; existing users (or users who skipped) will never see it again.
 *
 * `isReady` tells the caller when the watch page itself is rendered
 * (video loaded, subtitles present) so we don't try to spotlight empty
 * layout. `playbackMode` from useVideoPlayer is the right signal.
 */
export function useCoachMark(opts: {
  isAuthenticated: boolean;
  isReady: boolean;
  /** First-lesson tour: separate completion key and behavior events. */
  isFirstLesson?: boolean;
  onWordSaved?: () => void;
  onEvent?: (event: string, payload?: Record<string, unknown>) => void;
}) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
  const storageKey = opts.isFirstLesson ? FIRST_LESSON_STORAGE_KEY : STORAGE_KEY;
  const emit = useCallback((event: string, payload?: Record<string, unknown>) => {
    onEventRef.current?.(event, payload);
  }, []);

  // Show the tour once: onboarding done + authed + watch page ready + flag off
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(storageKey) === "true") return;
    if (!opts.isAuthenticated) return;
    if (!opts.isReady) return;
    // Defer one tick so layout settles (anchor rects would be 0 otherwise).
    const t = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(t);
  }, [opts.isAuthenticated, opts.isReady, storageKey]);

  useEffect(() => {
    if (active && opts.isFirstLesson) emit("first_lesson_enter");
  }, [active, opts.isFirstLesson, emit]);

  const finish = useCallback(() => {
    setActive(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "true");
    }
    if (opts.isFirstLesson) emit("first_lesson_complete");
  }, [storageKey, opts.isFirstLesson, emit]);

  const skip = useCallback(() => {
    if (opts.isFirstLesson) emit("first_lesson_skip");
    finish();
  }, [finish, opts.isFirstLesson, emit]);

  const next = useCallback(() => {
    setStepIndex((i) => i + 1);
  }, []);

  // External step advances (driven by useWordLookup success)
  const advanceFromWordSaved = useCallback(() => {
    if (opts.isFirstLesson) emit("first_lesson_word_saved");
    opts.onWordSaved?.();
    if (active && stepIndex === 1) setStepIndex(2);
  }, [active, stepIndex, opts.isFirstLesson, opts.onWordSaved, emit]);

  const advanceFromFirstWordClick = useCallback(() => {
    if (opts.isFirstLesson) emit("first_lesson_word_click");
    if (active && stepIndex === 0) setStepIndex(1);
  }, [active, stepIndex, opts.isFirstLesson, emit]);

  const advanceFromShadowing = useCallback(() => {
    if (opts.isFirstLesson) emit("first_lesson_shadowing");
  }, [opts.isFirstLesson, emit]);

  const steps: CoachStep[] = [
    {
      target: "[data-coach='subtitles']",
      title: "点击任意英文字幕单词",
      body: "把鼠标移到字幕上，点任意单词就能查它的释义、发音和真题例句",
      placement: "top",
    },
    {
      target: "[data-coach='word-card']",
      title: "加入词库",
      body: "在词卡里点「加入词库」，以后系统会自动提醒你复习",
      placement: "right",
    },
    {
      target: "[data-coach='practice']",
      title: "看完可以做练习或跟读",
      body: "视频右下角有练习入口，做真题、跟读重点句都能帮你巩固记忆",
      placement: "left",
    },
    {
      target: null,
      title: "准备好了，开始看视频吧！",
      body: "下次再进这个视频时，引导就不会再出现了",
    },
  ];

  return {
    active,
    stepIndex,
    steps,
    next,
    skip,
    finish,
    advanceFromFirstWordClick,
    advanceFromWordSaved,
    advanceFromShadowing,
  };
}
