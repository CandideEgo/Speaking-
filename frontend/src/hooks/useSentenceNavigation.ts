"use client";

import { useState, useCallback } from "react";

interface UseSentenceNavigationOptions {
  totalSentences: number;
  initialIndex?: number;
  onChange?: (newIndex: number) => void;
}

interface UseSentenceNavigationReturn {
  selectedIndex: number;
  goToSentence: (index: number) => void;
  nextSentence: () => void;
  prevSentence: () => void;
  randomSentence: () => void;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Hook for sentence navigation shared across learning modes.
 * Handles current sentence index, next/prev, go to sentence, and random selection.
 */
export function useSentenceNavigation({
  totalSentences,
  initialIndex = 0,
  onChange,
}: UseSentenceNavigationOptions): UseSentenceNavigationReturn {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  const goToSentence = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSentences) return;
      setSelectedIndex(index);
      onChange?.(index);
    },
    [totalSentences, onChange]
  );

  const nextSentence = useCallback(() => {
    goToSentence(selectedIndex + 1);
  }, [selectedIndex, goToSentence]);

  const prevSentence = useCallback(() => {
    goToSentence(selectedIndex - 1);
  }, [selectedIndex, goToSentence]);

  const randomSentence = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * totalSentences);
    goToSentence(randomIndex);
  }, [totalSentences, goToSentence]);

  return {
    selectedIndex,
    goToSentence,
    nextSentence,
    prevSentence,
    randomSentence,
    isFirst: selectedIndex === 0,
    isLast: selectedIndex === totalSentences - 1,
  };
}
