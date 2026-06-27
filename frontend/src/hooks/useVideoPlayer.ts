"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { VideoWithSubtitles } from "@/types";

export type PlaybackMode = "ready" | "processing" | "loading";

interface UseVideoPlayerOptions {
  videoId: string;
  setVideoAspectRatio: (ratio: number) => void;
}

interface UseVideoPlayerReturn {
  video: VideoWithSubtitles | null;
  playbackMode: PlaybackMode;
  currentSubtitleIndex: number;
  setCurrentSubtitleIndex: (idx: number) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  isDesktop: boolean;
  togglePlayPause: () => void;
  seekBy: (delta: number) => void;
  seekTo: (time: number) => void;
  navigateSubtitle: (delta: number) => void;
}

/**
 * Hook for video playback state and controls on the watch page.
 * All videos use local HTML5 playback — no YouTube IFrame embed.
 */
export function useVideoPlayer({
  videoId,
  setVideoAspectRatio,
}: UseVideoPlayerOptions): UseVideoPlayerReturn {
  const videoRef = useRef<HTMLVideoElement>(null!);

  const [video, setVideo] = useState<VideoWithSubtitles | null>(null);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("loading");
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  // Detect desktop layout
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const check = (e: MediaQueryListEvent | MediaQueryList) =>
      setIsDesktop(e.matches);
    check(mql);
    mql.addEventListener("change", check);
    return () => mql.removeEventListener("change", check);
  }, []);

  // Load video data
  useEffect(() => {
    api<VideoWithSubtitles>(`/api/v1/videos/${videoId}`)
      .then((v) => {
        setVideo(v);
        if (v.status === "ready" && v.video_url_720p) setPlaybackMode("ready");
        else if (v.status === "ready_subtitles" || v.status === "processing")
          setPlaybackMode("processing");
        else setPlaybackMode("loading");
      })
      .catch(() => toast.error("加载视频失败"));
  }, [videoId]);

  // Poll for video status when processing
  useEffect(() => {
    if (
      !video ||
      (video.status !== "processing" && video.status !== "ready_subtitles")
    )
      return;
    const interval = setInterval(async () => {
      try {
        const updated = await api<VideoWithSubtitles>(
          `/api/v1/videos/${videoId}`,
        );
        setVideo(updated);
        if (updated.status === "ready" && updated.video_url_720p)
          setPlaybackMode("ready");
        else if (
          updated.status === "ready_subtitles" ||
          updated.status === "processing"
        )
          setPlaybackMode("processing");
        else if (updated.status === "error") setPlaybackMode("loading");
      } catch {
        /* ignore polling errors */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [video?.status, videoId]);

  const togglePlayPause = useCallback(() => {
    if (videoRef.current?.paused) videoRef.current.play();
    else videoRef.current?.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(
        0,
        videoRef.current.currentTime + delta,
      );
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  }, []);

  const navigateSubtitle = useCallback(
    (delta: number) => {
      setVideo((prev) => {
        if (!prev?.subtitles) return prev;
        setCurrentSubtitleIndex((prevIdx) => {
          const newIndex = Math.max(
            0,
            Math.min(prev.subtitles.length - 1, prevIdx + delta),
          );
          seekTo(prev.subtitles[newIndex].start_time);
          return newIndex;
        });
        return prev;
      });
    },
    [seekTo],
  );

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
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

  return {
    video,
    playbackMode,
    currentSubtitleIndex,
    setCurrentSubtitleIndex,
    videoRef,
    isDesktop,
    togglePlayPause,
    seekBy,
    seekTo,
    navigateSubtitle,
  };
}
