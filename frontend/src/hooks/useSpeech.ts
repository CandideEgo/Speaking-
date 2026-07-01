"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseSpeechOptions {
  lang?: string;
  rate?: number;
  onEnd?: () => void;
}

interface UseSpeechReturn {
  isPlaying: boolean;
  speak: (text: string, options?: { rate?: number }) => void;
  stop: () => void;
}

/**
 * Hook for SpeechSynthesis boilerplate.
 * Handles creating utterance, speaking, stopping, and isPlaying state.
 */
export function useSpeech(
  defaultOptions: UseSpeechOptions = {},
): UseSpeechReturn {
  const { lang = "en-US", rate = 0.9, onEnd } = defaultOptions;
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(
    (text: string, options?: { rate?: number }) => {
      if (!text) return;

      speechSynthesis.cancel();
      setIsPlaying(true);

      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = options?.rate ?? rate;

      u.onend = () => {
        setIsPlaying(false);
        onEnd?.();
      };

      u.onerror = () => {
        setIsPlaying(false);
      };

      utteranceRef.current = u;
      speechSynthesis.speak(u);
    },
    [lang, rate, onEnd],
  );

  const stop = useCallback(() => {
    speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  // Stop speech on unmount to prevent audio playing after navigating away
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
    };
  }, []);

  return { isPlaying, speak, stop };
}
