"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { Subtitle } from "@/types";
import { SkipBack, SkipForward, Play, Pause, Volume2, VolumeX } from "lucide-react";

interface PlaybackControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackMode: "ready" | "processing" | "loading";
  subtitles: Subtitle[];
  onPrevSubtitle: () => void;
  onNextSubtitle: () => void;
  onSeekTo: (time: number) => void;
}

export default function PlaybackControls({
  videoRef,
  playbackMode,
  subtitles,
  onPrevSubtitle,
  onNextSubtitle,
}: PlaybackControlsProps) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
    }, 500);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [playbackMode]);

  function togglePlay() {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setPlaying(true);
      } else {
        videoRef.current.pause();
        setPlaying(false);
      }
    }
  }

  function toggleMute() {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(!muted);
    }
  }

  const duration = subtitles[subtitles.length - 1]?.end_time || 1;
  const progress = Math.min((currentTime / duration) * 100, 100);

  return (
    <div className="flex items-center gap-3 border-t border-white/10 bg-navy-elevated px-4 py-2 shrink-0">
      <button
        onClick={onPrevSubtitle}
        className="text-white/50 hover:text-white transition-colors"
        title="上一句"
        aria-label="上一句"
      >
        <SkipBack size={16} />
      </button>
      <button
        onClick={togglePlay}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-coral text-white hover:bg-coral-active transition-colors"
        title={playing ? "暂停" : "播放"}
        aria-label={playing ? "暂停" : "播放"}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <button
        onClick={onNextSubtitle}
        className="text-white/50 hover:text-white transition-colors"
        title="下一句"
        aria-label="下一句"
      >
        <SkipForward size={16} />
      </button>

      <span className="text-xs text-white/40 font-mono min-w-[40px]">
        {formatTime(currentTime)}
      </span>

      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-coral rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <span className="text-xs text-white/40 font-mono min-w-[40px]">{formatTime(duration)}</span>

      <button
        onClick={toggleMute}
        className="text-white/50 hover:text-white transition-colors"
        title={muted ? "取消静音" : "静音"}
        aria-label={muted ? "取消静音" : "静音"}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </div>
  );
}
