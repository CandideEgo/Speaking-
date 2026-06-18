'use client';

import { useState, useRef, useCallback } from 'react';
import type { YTPlayer, YTPlayerStateValue, YTPlayerEvent } from '@/types/youtube';

/** Hook for YouTube IFrame Player API — used as fallback when local video is not ready. */
export function useYouTubePlayer() {
  const playerRef = useRef<YTPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const apiLoadPromiseRef = useRef<Promise<void> | null>(null);

  /** Dynamically load the YouTube IFrame API script (idempotent). */
  const loadAPI = useCallback((): Promise<void> => {
    if (apiLoadPromiseRef.current) return apiLoadPromiseRef.current;

    // Already loaded
    if (window.YT?.Player) {
      apiLoadPromiseRef.current = Promise.resolve();
      return apiLoadPromiseRef.current;
    }

    apiLoadPromiseRef.current = new Promise<void>((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    });

    return apiLoadPromiseRef.current;
  }, []);

  /** Create a YT.Player instance inside the given container. */
  const initPlayer = useCallback(
    async (
      containerId: string,
      videoId: string,
      onReady?: (player: YTPlayer) => void,
      onStateChange?: (event: YTPlayerEvent) => void,
    ) => {
      await loadAPI();

      // Destroy previous instance if any
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }

      playerRef.current = new window.YT.Player(containerId, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: (event) => {
            setIsReady(true);
            onReady?.(event.target);
          },
          onStateChange: onStateChange,
        },
      });
    },
    [loadAPI],
  );

  const playVideo = useCallback(() => {
    playerRef.current?.playVideo();
  }, []);

  const pauseVideo = useCallback(() => {
    playerRef.current?.pauseVideo();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
  }, []);

  const getCurrentTime = useCallback((): Promise<number> => {
    return new Promise((resolve) => {
      // getCurrentTime is synchronous on a ready player
      const t = playerRef.current?.getCurrentTime?.();
      resolve(t ?? 0);
    });
  }, []);

  const destroy = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
    }
    setIsReady(false);
  }, []);

  return {
    isReady,
    initPlayer,
    playVideo,
    pauseVideo,
    seekTo,
    getCurrentTime,
    destroy,
  };
}
