"use client";

import { useCallback } from "react";
import { useSpeech } from "./useSpeech";

interface UsePracticeAudioReturn {
  /** Play a single word via TTS. */
  playWord: (word: string) => void;
  /** Play a full sentence via TTS. */
  playSentence: (sentence: string) => void;
  /** The text currently being spoken (null when idle). Compare against the
   * text a button plays to highlight only that button — a shared boolean
   * would light up every play button at once. */
  playingText: string | null;
  /** Whether audio is currently playing. */
  isPlaying: boolean;
  /** Stop current playback. */
  stop: () => void;
}

/**
 * Audio playback for practice questions.
 * Uses browser TTS (Web Speech API) for all audio.
 * Video-seek playback can be added later for sentence_repeat items.
 */
export function usePracticeAudio(): UsePracticeAudioReturn {
  const { isPlaying, currentText, speak, stop } = useSpeech({
    lang: "en-US",
    rate: 0.9,
  });

  const playWord = useCallback(
    (word: string) => {
      if (!word) return;
      speak(word, { rate: 0.85 });
    },
    [speak],
  );

  const playSentence = useCallback(
    (sentence: string) => {
      if (!sentence) return;
      speak(sentence, { rate: 0.8 });
    },
    [speak],
  );

  return { playWord, playSentence, playingText: currentText, isPlaying, stop };
}
