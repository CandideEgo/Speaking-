"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { VideoWithSubtitles } from "@/types";

export type PlaybackMode = "ready" | "processing" | "loading" | "error";

/** Pick the best available video URL (1080p > 720p > 480p). */
export function bestVideoUrl(v: VideoWithSubtitles): string | null {
  return v.video_url_1080p || v.video_url_720p || v.video_url_480p || null;
}

/** Extract YouTube video ID from a URL. */
export function youtubeId(v: VideoWithSubtitles): string | null {
  const m = v.source_url?.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/** Whether the video can be played (local file or YouTube embed). */
export function canPlay(v: VideoWithSubtitles): boolean {
  return !!bestVideoUrl(v) || !!youtubeId(v);
}

declare global {
  interface Window {
    YT?: { Player?: YTPlayerClass };
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Minimal shape of the YouTube IFrame player we use. */
interface YTPlayerInstance {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  destroy: () => void;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, unknown>;
  events?: {
    onReady?: () => void;
    onStateChange?: (e: { data?: number }) => void;
    onError?: () => void;
  };
}

interface YTPlayerClass {
  new (el: HTMLElement, options: YTPlayerOptions): YTPlayerInstance;
}

interface UseVideoPlayerOptions {
  videoId: string;
  /** Playback-time tick (HTML5 timeupdate / YouTube poll) for subtitle sync. */
  onTimeTick?: (time: number) => void;
}

interface UseVideoPlayerReturn {
  video: VideoWithSubtitles | null;
  playbackMode: PlaybackMode;
  currentSubtitleIndex: number;
  setCurrentSubtitleIndex: (idx: number) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Container element for the YouTube IFrame player (rendered when isYtMode). */
  ytContainerRef: React.RefObject<HTMLDivElement>;
  /** Whether the current video plays via YouTube IFrame (no local file). */
  isYtMode: boolean;
  isDesktop: boolean;
  play: () => void;
  togglePlayPause: () => void;
  seekBy: (delta: number) => void;
  seekTo: (time: number) => void;
  navigateSubtitle: (delta: number) => void;
  retry: () => void;
}

/**
 * Hook for video playback state and controls on the watch page.
 *
 * Two playback backends:
 *  - HTML5 <video> when a local file exists (video_url_*).
 *  - YouTube IFrame (YT.Player) when the video is routed to YouTube and has
 *    no local file. The IFrame player is controlled via the official IFrame
 *    API (postMessage under the hood), which makes seekTo work — clicking a
 *    subtitle in the right panel now jumps the YouTube video too.
 */
export function useVideoPlayer({
  videoId,
  onTimeTick,
}: UseVideoPlayerOptions): UseVideoPlayerReturn {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const ytContainerRef = useRef<HTMLDivElement>(null!);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytApiReadyRef = useRef(false);
  const ytReadyRef = useRef(false);
  const ytPlayingRef = useRef(false);
  const mountedYtIdRef = useRef<string | null>(null);

  const [video, setVideo] = useState<VideoWithSubtitles | null>(null);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("loading");
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isYtMode, setIsYtMode] = useState(false);

  // Keep a ref in sync so callbacks (navigateSubtitle) can read the latest
  // video data without stale closures or putting side effects in updaters.
  const videoDataRef = useRef<VideoWithSubtitles | null>(null);
  useEffect(() => {
    videoDataRef.current = video;
  }, [video]);

  const onTimeTickRef = useRef(onTimeTick);
  useEffect(() => {
    onTimeTickRef.current = onTimeTick;
  }, [onTimeTick]);

  // Detect desktop layout
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const check = (e: MediaQueryListEvent | MediaQueryList) => setIsDesktop(e.matches);
    check(mql);
    mql.addEventListener("change", check);
    return () => mql.removeEventListener("change", check);
  }, []);

  // Load video data
  const loadVideo = useCallback(() => {
    setPlaybackMode("loading");
    api<VideoWithSubtitles>(`/api/v1/videos/${videoId}`)
      .then((v) => {
        setVideo(v);
        if (v.status === "ready" && canPlay(v)) setPlaybackMode("ready");
        else if (v.status === "ready_subtitles" || v.status === "processing")
          setPlaybackMode("processing");
        else setPlaybackMode("loading");
      })
      .catch(() => {
        setPlaybackMode("error");
        toast.error("加载视频失败");
      });
  }, [videoId]);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  // Poll for video status when processing
  useEffect(() => {
    if (!video || (video.status !== "processing" && video.status !== "ready_subtitles")) return;
    const interval = setInterval(async () => {
      try {
        const updated = await api<VideoWithSubtitles>(`/api/v1/videos/${videoId}`);
        setVideo(updated);
        if (updated.status === "ready" && canPlay(updated)) setPlaybackMode("ready");
        else if (updated.status === "ready_subtitles" || updated.status === "processing")
          setPlaybackMode("processing");
        else if (updated.status === "error") setPlaybackMode("loading");
      } catch {
        /* ignore polling errors */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [video, videoId]);

  // ---------------------------------------------------------------------------
  // YouTube IFrame player (fallback when no local file)
  // ---------------------------------------------------------------------------

  const ensureYouTubeApi = useCallback((): Promise<void> => {
    if (window.YT?.Player) {
      ytApiReadyRef.current = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      if (document.getElementById("yt-iframe-api")) {
        // Script already injected; wait for the API callback to fire.
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          prev?.();
          ytApiReadyRef.current = true;
          resolve();
        };
        return;
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        ytApiReadyRef.current = true;
        resolve();
      };
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }, []);

  const resumeFromSavedPosition = useCallback(() => {
    api<{ position_seconds: number | null }>(`/api/v1/learning/progress/${videoId}`)
      .then((d) => {
        const pos = d.position_seconds;
        if (
          typeof pos === "number" &&
          pos > 5 &&
          ytReadyRef.current &&
          ytPlayerRef.current?.seekTo
        ) {
          ytPlayerRef.current.seekTo(pos, true);
        }
      })
      .catch(() => {
        /* first-time viewers have no saved position */
      });
  }, [videoId]);

  const createYouTubePlayer = useCallback(
    (ytId: string) => {
      if (!ytContainerRef.current || !window.YT?.Player) return;
      ytReadyRef.current = false;
      ytPlayingRef.current = false;
      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId: ytId,
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            ytReadyRef.current = true;
            resumeFromSavedPosition();
          },
          onStateChange: (e: { data?: number }) => {
            // 1 = playing, 2 = paused, 0 = ended
            ytPlayingRef.current = e?.data === 1;
            if (e?.data === 2) {
              // Surface the final position once when pausing (time ticks keep
              // running so subtitle highlight stays in sync during pause too).
              onTimeTickRef.current?.(ytPlayerRef.current?.getCurrentTime?.() ?? 0);
            }
          },
          onError: () => {
            toast.error("视频播放出错，请稍后重试");
          },
        },
      });
    },
    [resumeFromSavedPosition]
  );

  /** Mount the YouTube IFrame player into ytContainerRef (idempotent per video). */
  const mountYouTube = useCallback(
    (ytId: string) => {
      if (mountedYtIdRef.current === ytId) return;
      mountedYtIdRef.current = ytId;
      ensureYouTubeApi().then(() => createYouTubePlayer(ytId));
    },
    [ensureYouTubeApi, createYouTubePlayer]
  );

  const destroyYouTube = useCallback(() => {
    try {
      ytPlayerRef.current?.destroy?.();
    } catch {
      /* already destroyed */
    }
    ytPlayerRef.current = null;
    ytReadyRef.current = false;
    ytPlayingRef.current = false;
    mountedYtIdRef.current = null;
  }, []);

  // Derive the playback backend from the loaded video. When a local file
  // exists we prefer HTML5; otherwise fall back to the YouTube IFrame.
  useEffect(() => {
    if (playbackMode !== "ready" || !video) {
      setIsYtMode(false);
      return;
    }
    const yt = youtubeId(video);
    const useYt = !!yt && !bestVideoUrl(video);
    setIsYtMode(useYt);
    if (useYt && yt) mountYouTube(yt);
    else destroyYouTube();
  }, [playbackMode, video, mountYouTube, destroyYouTube]);

  // YouTube time poll: keeps the subtitle highlight + watch-time tracking in
  // sync while the IFrame plays (IFrame has no timeupdate DOM events).
  useEffect(() => {
    if (!isYtMode) return;
    const interval = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current || typeof p.getCurrentTime !== "function") return;
      onTimeTickRef.current?.(p.getCurrentTime() ?? 0);
    }, 250);
    return () => clearInterval(interval);
  }, [isYtMode]);

  // Clean up the IFrame player on unmount.
  useEffect(() => {
    return () => {
      try {
        ytPlayerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Unified playback controls (both backends)
  // ---------------------------------------------------------------------------

  const currentTime = useCallback((): number => {
    if (videoRef.current && Number.isFinite(videoRef.current.currentTime))
      return videoRef.current.currentTime;
    if (ytReadyRef.current && ytPlayerRef.current?.getCurrentTime)
      return ytPlayerRef.current.getCurrentTime() ?? 0;
    return 0;
  }, []);

  const play = useCallback(() => {
    if (videoRef.current) videoRef.current.play().catch(() => {});
    else if (ytReadyRef.current && ytPlayerRef.current?.playVideo) ytPlayerRef.current.playVideo();
  }, []);

  const togglePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) videoRef.current.play();
      else videoRef.current.pause();
    } else if (ytPlayerRef.current) {
      if (ytPlayingRef.current) ytPlayerRef.current.pauseVideo();
      else ytPlayerRef.current.playVideo();
    }
  }, []);

  const seekBy = useCallback((delta: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + delta);
    } else if (ytReadyRef.current && ytPlayerRef.current) {
      const t = Math.max(0, (ytPlayerRef.current.getCurrentTime?.() ?? 0) + delta);
      ytPlayerRef.current.seekTo(t, true);
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play().catch(() => {});
    } else if (ytReadyRef.current && ytPlayerRef.current?.seekTo) {
      ytPlayerRef.current.seekTo(time, true);
      ytPlayerRef.current.playVideo();
    }
  }, []);

  const navigateSubtitle = useCallback(
    (delta: number) => {
      const vd = videoDataRef.current;
      if (!vd?.subtitles) return;
      // Use functional update to get the latest index (avoids stale closure).
      // The state updater is pure — the seekTo side effect runs outside it.
      let newTime: number | null = null;
      setCurrentSubtitleIndex((prevIdx) => {
        const newIndex = Math.max(0, Math.min(vd.subtitles!.length - 1, prevIdx + delta));
        newTime = vd.subtitles![newIndex].start_time;
        return newIndex;
      });
      // Side effect: seek the video player (must be outside the updater)
      if (newTime !== null) seekTo(newTime);
    },
    [seekTo]
  );

  // Keyboard shortcuts (skip when focus is on interactive elements)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLButtonElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLAnchorElement
      )
        return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlayPause();
          break;
        case "ArrowLeft":
          seekBy(-5);
          break;
        case "ArrowRight":
          seekBy(5);
          break;
        case "ArrowUp":
          navigateSubtitle(-1);
          break;
        case "ArrowDown":
          navigateSubtitle(1);
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlayPause, seekBy, navigateSubtitle]);

  // Resume from last saved position on first ready (HTML5 backend).
  useEffect(() => {
    if (playbackMode !== "ready" || isYtMode) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ position_seconds: number | null }>(
          `/api/v1/learning/progress/${videoId}`
        );
        if (cancelled) return;
        const pos = data.position_seconds;
        if (typeof pos === "number" && pos > 5 && videoRef.current) {
          videoRef.current.currentTime = pos;
        }
      } catch {
        // First-time viewers have no saved position — ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playbackMode, videoId, isYtMode]);

  // Periodic position save (every 10s while playing) → PATCH /learning/progress.
  // This populates LearningRecord.position_seconds / progress_percentage, which
  // feed the P1 Retention score factor.
  useEffect(() => {
    if (playbackMode !== "ready") return;
    const interval = setInterval(async () => {
      const playing = videoRef.current ? !videoRef.current.paused : ytPlayingRef.current;
      if (!playing) return;
      const t = currentTime();
      if (t <= 0) return;
      try {
        await api("/api/v1/learning/progress", {
          method: "PATCH",
          body: JSON.stringify({
            video_id: videoId,
            position_seconds: t,
          }),
        });
      } catch {
        // Non-blocking — position save is best-effort.
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [playbackMode, videoId, currentTime]);

  return {
    video,
    playbackMode,
    currentSubtitleIndex,
    setCurrentSubtitleIndex,
    videoRef,
    ytContainerRef,
    isYtMode,
    isDesktop,
    play,
    togglePlayPause,
    seekBy,
    seekTo,
    navigateSubtitle,
    retry: loadVideo,
  };
}
