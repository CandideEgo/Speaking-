'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import type { YouTubePlayerHandle } from '@/components/YouTubePlayer';
import {
  SkipBack, SkipForward, Play, Pause,
  Volume2, VolumeX, Maximize, Minimize,
  Gauge, Eye, EyeOff, Music, Repeat,
  Timer, AArrowDown, ChevronLeft, ChevronRight,
} from 'lucide-react';

interface Subtitle {
  id: string;
  start_time: number;
  end_time: number;
  text_en: string;
  text_zh: string | null;
}

interface PlayerControlBarProps {
  playerRef: React.RefObject<YouTubePlayerHandle | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackMode: 'local' | 'youtube' | 'loading';
  subtitles: Subtitle[];
  onPrevSubtitle: () => void;
  onNextSubtitle: () => void;
  onSeekTo: (time: number) => void;
  isVideoHidden?: boolean;
  onToggleVideoVisibility?: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function PlayerControlBar({
  playerRef,
  videoRef,
  playbackMode,
  subtitles,
  onPrevSubtitle,
  onNextSubtitle,
  onSeekTo,
  isVideoHidden = false,
  onToggleVideoVisibility,
}: PlayerControlBarProps) {
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
      if (playbackMode === 'youtube') {
        setCurrentTime(playerRef.current?.getCurrentTime?.() ?? 0);
      } else if (playbackMode === 'local' && videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
    }, 500);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [playbackMode]);

  // Close speed menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function togglePlay() {
    if (playbackMode === 'youtube') {
      if (playerRef.current?.isPaused()) {
        playerRef.current.play();
        setPlaying(true);
      } else {
        playerRef.current?.pause();
        setPlaying(false);
      }
    } else if (videoRef.current) {
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
    if (playbackMode === 'local' && videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    // YouTube player doesn't support playbackRate via our wrapper, but we track it
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
    <div className="flex flex-col bg-canvas border-t border-hairline shrink-0">
      {/* Main control bar */}
      <div className="flex items-center gap-1 px-3 py-2">
        {/* Speed selector */}
        <div className="relative" ref={speedMenuRef}>
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-cream-soft transition-colors"
            title="倍速"
          >
            <Gauge size={16} className="text-ink/50" />
            <span className="text-[10px] text-ink/40 font-mono">{playbackRate}x</span>
          </button>
          {showSpeedMenu && (
            <div className="absolute bottom-full left-0 mb-1 bg-white rounded-lg shadow-lg border border-hairline py-1 z-50 min-w-[80px]">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => changeSpeed(s)}
                  className={cn(
                    'w-full px-3 py-1.5 text-xs text-left transition-colors',
                    playbackRate === s
                      ? 'bg-coral/10 text-coral font-medium'
                      : 'text-ink/70 hover:bg-cream-soft'
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
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-cream-soft transition-colors"
            title={isVideoHidden ? '显示视频' : '隐藏视频'}
          >
            {isVideoHidden ? (
              <EyeOff size={16} className="text-ink/50" />
            ) : (
              <Eye size={16} className="text-ink/50" />
            )}
            <span className="text-[10px] text-ink/40">隐藏视频</span>
          </button>
        )}

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-cream-soft transition-colors"
          title="全屏"
        >
          {isFullscreen ? <Minimize size={16} className="text-ink/50" /> : <Maximize size={16} className="text-ink/50" />}
          <span className="text-[10px] text-ink/40">全屏</span>
        </button>

        {/* Phonetic toggle */}
        <button
          onClick={() => setShowPhonetic(!showPhonetic)}
          className={cn(
            'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors',
            showPhonetic ? 'bg-coral/10' : 'hover:bg-cream-soft'
          )}
          title="音标"
        >
          <Music size={16} className={showPhonetic ? 'text-coral' : 'text-ink/50'} />
          <span className="text-[10px] text-ink/40">音标</span>
        </button>

        {/* Separator */}
        <div className="w-px h-8 bg-hairline mx-1" />

        {/* Previous subtitle */}
        <button
          onClick={onPrevSubtitle}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-cream-soft transition-colors"
          title="上一句"
        >
          <ChevronLeft size={16} className="text-ink/50" />
          <span className="text-[10px] text-ink/40">上一句</span>
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg hover:bg-cream-soft transition-colors"
          title={playing ? '暂停' : '播放'}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-coral text-white hover:bg-coral-active transition-colors">
            {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </div>
          <span className="text-[10px] text-ink/40">{playing ? '暂停' : '播放'}</span>
        </button>

        {/* Next subtitle */}
        <button
          onClick={onNextSubtitle}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-cream-soft transition-colors"
          title="下一句"
        >
          <ChevronRight size={16} className="text-ink/50" />
          <span className="text-[10px] text-ink/40">下一句</span>
        </button>

        {/* A-B Loop */}
        <button
          onClick={() => setIsLoopEnabled(!isLoopEnabled)}
          className={cn(
            'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors',
            isLoopEnabled ? 'bg-coral/10' : 'hover:bg-cream-soft'
          )}
          title="A-B循环"
        >
          <Repeat size={16} className={isLoopEnabled ? 'text-coral' : 'text-ink/50'} />
          <span className="text-[10px] text-ink/40">A-B循环</span>
        </button>

        {/* Interval */}
        <button
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-cream-soft transition-colors"
          title="间隔"
        >
          <Timer size={16} className="text-ink/50" />
          <span className="text-[10px] text-ink/40">间隔</span>
        </button>

        {/* Sentence pause */}
        <button
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-cream-soft transition-colors"
          title="单句暂停"
        >
          <AArrowDown size={16} className="text-ink/50" />
          <span className="text-[10px] text-ink/40">单句暂停</span>
        </button>

        {/* Volume (local only) */}
        {playbackMode === 'local' && (
          <button
            onClick={toggleMute}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-cream-soft transition-colors"
            title={muted ? '取消静音' : '静音'}
          >
            {muted ? <VolumeX size={16} className="text-ink/50" /> : <Volume2 size={16} className="text-ink/50" />}
            <span className="text-[10px] text-ink/40">音量</span>
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <span className="text-[11px] text-ink/40 font-mono min-w-[40px]">{formatTime(currentTime)}</span>
        <div
          className="flex-1 h-1 bg-hairline rounded-full overflow-hidden cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = ((e.clientX - rect.left) / rect.width) * 100;
            onSeekTo((percent / 100) * duration);
          }}
        >
          <div
            className="h-full bg-coral rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] text-ink/40 font-mono min-w-[40px]">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
