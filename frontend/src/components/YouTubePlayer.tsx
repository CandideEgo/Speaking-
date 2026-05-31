'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  isPaused: () => boolean;
}

interface Props {
  videoId: string;
  onTimeUpdate: (time: number) => void;
  onReady?: () => void;
  onError?: () => void;
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    if (window.YT?.Player) { resolve(); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript?.parentNode?.insertBefore(tag, firstScript);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
  return apiLoadPromise;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(
  function YouTubePlayer({ videoId, onTimeUpdate, onReady, onError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [loadError, setLoadError] = useState(false);

    useImperativeHandle(ref, () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, true),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      isPaused: () => playerRef.current?.getPlayerState() !== 1,
    }));

    useEffect(() => {
      let cancelled = false;
      let timeout: ReturnType<typeof setTimeout>;

      async function init() {
        try {
          await loadYouTubeAPI();
          if (cancelled) return;

          playerRef.current = new window.YT.Player(containerRef.current, {
            videoId,
            playerVars: { controls: 1, modestbranding: 1, rel: 0, playsinline: 1 },
            events: {
              onReady: () => {
                if (cancelled) return;
                onReady?.();
                intervalRef.current = setInterval(() => {
                  const t = playerRef.current?.getCurrentTime?.();
                  if (typeof t === 'number') onTimeUpdate(t);
                }, 200);
              },
              onError: () => {
                if (cancelled) return;
                setLoadError(true);
                onError?.();
              },
            },
          });
        } catch {
          if (!cancelled) setLoadError(true);
        }
      }

      timeout = setTimeout(() => {
        if (!playerRef.current && !cancelled) setLoadError(true);
      }, 10000);

      init();

      return () => {
        cancelled = true;
        clearTimeout(timeout);
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (playerRef.current) {
          try { playerRef.current.destroy(); } catch {}
          playerRef.current = null;
        }
      };
    }, [videoId]);

    useEffect(() => {
      if (playerRef.current?.loadVideoById) {
        playerRef.current.loadVideoById(videoId);
      }
    }, [videoId]);

    if (loadError) {
      return (
        <div className="flex items-center justify-center w-full aspect-video bg-slate-900 rounded-lg">
          <div className="text-center">
            <p className="text-slate-400">YouTube player failed to load</p>
            <p className="text-sm text-slate-500 mt-1">
              The video may be blocked in your region. Full video is being processed.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="youtube-player-container w-full aspect-video">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    );
  }
);

export default YouTubePlayer;
