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
  getVideoDimensions: () => { width: number; height: number };
}

interface Props {
  videoId: string;
  onTimeUpdate: (time: number) => void;
  onReady?: () => void;
  onError?: () => void;
  onDimensionsChange?: (width: number, height: number) => void;
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
  function YouTubePlayer({ videoId, onTimeUpdate, onReady, onError, onDimensionsChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);
    const readyRef = useRef(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [aspectRatio, setAspectRatio] = useState<number | null>(null); // w/h ratio

    useImperativeHandle(ref, () => ({
      play: () => readyRef.current && playerRef.current?.playVideo(),
      pause: () => readyRef.current && playerRef.current?.pauseVideo(),
      seekTo: (seconds: number) => readyRef.current && playerRef.current?.seekTo(seconds, true),
      getCurrentTime: () => (readyRef.current ? playerRef.current?.getCurrentTime() : 0) ?? 0,
      isPaused: () => !readyRef.current || playerRef.current?.getPlayerState() !== 1,
      getVideoDimensions: () => {
        if (!readyRef.current || !playerRef.current) return { width: 1920, height: 1080 };
        return {
          width: playerRef.current.getVideoWidth?.() ?? 1920,
          height: playerRef.current.getVideoHeight?.() ?? 1080,
        };
      },
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
                readyRef.current = true;

                // Detect actual video dimensions for adaptive aspect ratio
                try {
                  const vw = playerRef.current.getVideoWidth?.() ?? 0;
                  const vh = playerRef.current.getVideoHeight?.() ?? 0;
                  if (vw > 0 && vh > 0) {
                    setAspectRatio(vw / vh);
                    onDimensionsChange?.(vw, vh);
                  }
                } catch {}

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
        readyRef.current = false;
        clearTimeout(timeout);
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (playerRef.current) {
          try { playerRef.current.destroy(); } catch {}
          playerRef.current = null;
        }
      };
    }, [videoId]);

    if (loadError) {
      return (
        <div className="flex items-center justify-center w-full h-full bg-slate-900 rounded-lg">
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
      <div
        className="youtube-player-container w-full"
        style={{ aspectRatio: aspectRatio ? `${aspectRatio}` : '16/9' }}
      >
        <div ref={containerRef} className="w-full h-full" />
      </div>
    );
  }
);

export default YouTubePlayer;
