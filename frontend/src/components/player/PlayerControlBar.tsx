"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { Subtitle } from "@/types";
import {
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Gauge,
  Eye,
  EyeOff,
  Music,
  Repeat,
  Timer,
  AArrowDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface PlayerControlBarProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackMode: "ready" | "processing" | "loading";
  subtitles: Subtitle[];
  onPrevSubtitle: () => void;
  onNextSubtitle: () => void;
  onSeekTo: (time: number) => void;
  isVideoHidden?: boolean;
  onToggleVideoVisibility?: () => void;
  variant?: "light" | "dark";
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function PlayerControlBar({
  videoRef,
  playbackMode,
  subtitles,
  onPrevSubtitle,
  onNextSubtitle,
  onSeekTo,
  isVideoHidden = false,
  onToggleVideoVisibility,
  variant = "light",
}: PlayerControlBarProps) {
  const isDark = variant === "dark";

  // Theme-aware class helpers
  const t = {
    bg: isDark ? "bg-dark-elevated" : "bg-canvas",
    border: isDark ? "border-dark-surface" : "border-hairline",
    textPrimary: isDark ? "text-ivory/80" : "text-ink/80",
    textSecondary: isDark ? "text-ivory/80" : "text-ink/80",
    textMuted: isDark ? "text-ivory/60" : "text-ink/60",
    hoverBg: isDark ? "hover:bg-dark-surface/50" : "hover:bg-cream-soft",
    activeBg: isDark ? "bg-terracotta/20" : "bg-coral/10",
    activeText: isDark ? "text-terracotta" : "text-coral",
    iconColor: isDark ? "text-ivory/90" : "text-ink/85",
    progressBg: isDark ? "bg-dark-surface/60" : "bg-hairline",
    progressFill: isDark ? "bg-terracotta" : "bg-coral",
    controlBg: isDark
      ? "bg-terracotta hover:bg-terracotta/80"
      : "bg-coral hover:bg-coral-active",
    white: isDark ? "text-ivory" : "text-white",
  };

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoopEnabled, setIsLoopEnabled] = useState(false);
  const [showPhonetic, setShowPhonetic] = useState(true);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

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

  // Close speed menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        speedMenuRef.current &&
        !speedMenuRef.current.contains(e.target as Node)
      ) {
        setShowSpeedMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

  function changeSpeed(speed: number) {
    setPlaybackRate(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      videoRef.current?.parentElement?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  const duration = subtitles[subtitles.length - 1]?.end_time || 1;
  const progress = Math.min((currentTime / duration) * 100, 100);

  return (
    <div className={cn("flex flex-col border-t shrink-0", t.bg, t.border)}>
      {/* Main control bar */}
      <div className="flex items-center justify-center gap-2 px-3 py-2">
        {/* Speed selector */}
        <div className="relative" ref={speedMenuRef}>
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className={cn(
              "flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors",
              t.hoverBg,
            )}
            title="倍速"
            aria-label="倍速选择"
          >
            <Gauge size={20} className={t.iconColor} />
            <span className={cn("text-xs font-mono", t.textSecondary)}>
              {playbackRate}x
            </span>
          </button>
          {showSpeedMenu && (
            <div
              className={cn(
                "absolute bottom-full left-0 mb-1 rounded-lg shadow-lg border py-1 z-50 min-w-[80px]",
                isDark
                  ? "bg-dark-elevated border-dark-surface"
                  : "bg-white border-hairline",
              )}
            >
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => changeSpeed(s)}
                  className={cn(
                    "w-full px-3 py-1.5 text-xs text-left transition-colors",
                    playbackRate === s
                      ? cn(
                          isDark
                            ? "bg-terracotta/20 text-terracotta"
                            : "bg-coral/10 text-coral",
                          "font-medium",
                        )
                      : cn(
                          isDark
                            ? "text-ivory/70 hover:bg-dark-surface/50"
                            : "text-ink/70 hover:bg-cream-soft",
                        ),
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hide video toggle */}
        {onToggleVideoVisibility && (
          <button
            onClick={onToggleVideoVisibility}
            className={cn(
              "flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors",
              t.hoverBg,
            )}
            title={isVideoHidden ? "显示视频" : "隐藏视频"}
          >
            {isVideoHidden ? (
              <EyeOff size={20} className={t.iconColor} />
            ) : (
              <Eye size={20} className={t.iconColor} />
            )}
            <span className={cn("text-xs", t.textSecondary)}>隐藏视频</span>
          </button>
        )}

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className={cn(
            "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors",
            t.hoverBg,
          )}
          title="全屏"
          aria-label={isFullscreen ? "退出全屏" : "全屏"}
        >
          {isFullscreen ? (
            <Minimize size={20} className={t.iconColor} />
          ) : (
            <Maximize size={20} className={t.iconColor} />
          )}
          <span className={cn("text-xs", t.textSecondary)}>全屏</span>
        </button>

        {/* Phonetic toggle */}
        <button
          onClick={() => setShowPhonetic(!showPhonetic)}
          className={cn(
            "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors",
            showPhonetic ? t.activeBg : t.hoverBg,
          )}
          title="音标"
          aria-label={showPhonetic ? "隐藏音标" : "显示音标"}
        >
          <Music
            size={20}
            className={showPhonetic ? t.activeText : t.iconColor}
          />
          <span className={cn("text-xs", t.textSecondary)}>音标</span>
        </button>

        {/* Separator */}
        <div
          className={cn(
            "w-px h-10 mx-1",
            isDark ? "bg-dark-surface" : "bg-hairline",
          )}
        />

        {/* Previous subtitle */}
        <button
          onClick={onPrevSubtitle}
          className={cn(
            "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors",
            t.hoverBg,
          )}
          title="上一句"
          aria-label="上一句"
        >
          <ChevronLeft size={20} className={t.iconColor} />
          <span className={cn("text-xs", t.textSecondary)}>上一句</span>
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className={cn(
            "flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors",
            t.hoverBg,
          )}
          title={playing ? "暂停" : "播放"}
          aria-label={playing ? "暂停" : "播放"}
        >
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              t.controlBg,
              t.white,
            )}
          >
            {playing ? (
              <Pause size={20} />
            ) : (
              <Play size={20} className="ml-0.5" />
            )}
          </div>
          <span className={cn("text-xs", t.textSecondary)}>
            {playing ? "暂停" : "播放"}
          </span>
        </button>

        {/* Next subtitle */}
        <button
          onClick={onNextSubtitle}
          className={cn(
            "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors",
            t.hoverBg,
          )}
          title="下一句"
          aria-label="下一句"
        >
          <ChevronRight size={20} className={t.iconColor} />
          <span className={cn("text-xs", t.textSecondary)}>下一句</span>
        </button>

        {/* A-B Loop */}
        <button
          onClick={() => setIsLoopEnabled(!isLoopEnabled)}
          className={cn(
            "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors",
            isLoopEnabled ? t.activeBg : t.hoverBg,
          )}
          title="A-B循环"
          aria-label={isLoopEnabled ? "关闭循环" : "开启循环"}
        >
          <Repeat
            size={20}
            className={isLoopEnabled ? t.activeText : t.iconColor}
          />
          <span className={cn("text-xs", t.textSecondary)}>A-B循环</span>
        </button>

        {/* Interval */}
        <button
          className={cn(
            "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors",
            t.hoverBg,
          )}
          title="间隔"
        >
          <Timer size={20} className={t.iconColor} />
          <span className={cn("text-xs", t.textSecondary)}>间隔</span>
        </button>

        {/* Sentence pause */}
        <button
          className={cn(
            "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors",
            t.hoverBg,
          )}
          title="单句暂停"
        >
          <AArrowDown size={20} className={t.iconColor} />
          <span className={cn("text-xs", t.textSecondary)}>单句暂停</span>
        </button>

        {/* Volume */}
        <button
          onClick={toggleMute}
          className={cn(
            "flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors",
            t.hoverBg,
          )}
          title={muted ? "取消静音" : "静音"}
          aria-label={muted ? "取消静音" : "静音"}
        >
          {muted ? (
            <VolumeX size={20} className={t.iconColor} />
          ) : (
            <Volume2 size={20} className={t.iconColor} />
          )}
          <span className={cn("text-xs", t.textSecondary)}>音量</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <span
          className={cn("text-[11px] font-mono min-w-[40px]", t.textSecondary)}
        >
          {formatTime(currentTime)}
        </span>
        <div
          className={cn(
            "flex-1 h-1 rounded-full overflow-hidden cursor-pointer",
            t.progressBg,
          )}
          role="slider"
          tabIndex={0}
          aria-label="播放进度"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = ((e.clientX - rect.left) / rect.width) * 100;
            onSeekTo((percent / 100) * duration);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              onSeekTo(Math.min(currentTime + 5, duration));
            } else if (e.key === "ArrowLeft") {
              onSeekTo(Math.max(currentTime - 5, 0));
            }
          }}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              t.progressFill,
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span
          className={cn("text-[11px] font-mono min-w-[40px]", t.textSecondary)}
        >
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
