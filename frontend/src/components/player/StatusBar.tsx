'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';
import {
  Repeat, Eraser, Sparkles, Gauge, Maximize,
  Play, Pause, SkipBack, SkipForward,
} from 'lucide-react';

interface StatusBarProps {
  currentTime: number;
  duration: number;
  currentIndex: number;
  totalSubtitles: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekTo: (time: number) => void;
  onPrevSubtitle: () => void;
  onNextSubtitle: () => void;
  playbackRate: number;
  onChangeSpeed: (speed: number) => void;
}

export default function StatusBar({
  currentTime,
  duration,
  currentIndex,
  totalSubtitles,
  isPlaying,
  onTogglePlay,
  onSeekTo,
  onPrevSubtitle,
  onNextSubtitle,
  playbackRate,
  onChangeSpeed,
}: StatusBarProps) {
  const [isLoopEnabled, setIsLoopEnabled] = useState(false);
  const [isCleanScreen, setIsCleanScreen] = useState(false);
  const [isSmartMode, setIsSmartMode] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-canvas border-t border-hairline">
      {/* Progress bar */}
      <div
        className="h-1 bg-hairline cursor-pointer group"
        role="slider"
        tabIndex={0}
        aria-label="播放进度"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          onSeekTo(percent * duration);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { onSeekTo(Math.min(currentTime + 5, duration)); }
          else if (e.key === 'ArrowLeft') { onSeekTo(Math.max(currentTime - 5, 0)); }
        }}
      >
        <div
          className="h-full bg-coral rounded-r transition-all duration-150 relative"
          style={{ width: `${progress}%` }}
        >
          {/* Progress thumb */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-coral rounded-full shadow-md transition-opacity" />
        </div>
      </div>

      {/* Status bar content */}
      <div className="flex items-center justify-between px-4 py-1.5">
        {/* Left: Time and progress info */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-ink/60 font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <span className="text-[11px] text-ink/50 font-mono">
            {currentIndex + 1} / {totalSubtitles}
          </span>
        </div>

        {/* Center: Playback controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={onPrevSubtitle}
            className="p-1.5 rounded-lg text-ink/60 hover:text-ink hover:bg-cream-soft transition-colors"
            title="上一句"
            aria-label="上一句"
          >
            <SkipBack size={14} />
          </button>
          <button
            onClick={onTogglePlay}
            className="p-1.5 rounded-lg text-ink/60 hover:text-ink hover:bg-cream-soft transition-colors"
            title={isPlaying ? '暂停' : '播放'}
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={onNextSubtitle}
            className="p-1.5 rounded-lg text-ink/60 hover:text-ink hover:bg-cream-soft transition-colors"
            title="下一句"
            aria-label="下一句"
          >
            <SkipForward size={14} />
          </button>
        </div>

        {/* Right: Quick controls */}
        <div className="flex items-center gap-1">
          {/* Loop */}
          <button
            onClick={() => setIsLoopEnabled(!isLoopEnabled)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors',
              isLoopEnabled
                ? 'bg-coral/10 text-coral'
                : 'text-ink/60 hover:text-ink hover:bg-cream-soft'
            )}
            title="连播"
            aria-label={isLoopEnabled ? '关闭连播' : '开启连播'}
          >
            <Repeat size={12} />
            <span className="hidden sm:inline">连播</span>
          </button>

          {/* Clean screen */}
          <button
            onClick={() => setIsCleanScreen(!isCleanScreen)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors',
              isCleanScreen
                ? 'bg-coral/10 text-coral'
                : 'text-ink/60 hover:text-ink hover:bg-cream-soft'
            )}
            title="清屏"
            aria-label={isCleanScreen ? '退出清屏' : '清屏'}
          >
            <Eraser size={12} />
            <span className="hidden sm:inline">清屏</span>
          </button>

          {/* Smart mode */}
          <button
            onClick={() => setIsSmartMode(!isSmartMode)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors',
              isSmartMode
                ? 'bg-coral/10 text-coral'
                : 'text-ink/60 hover:text-ink hover:bg-cream-soft'
            )}
            title="智能"
            aria-label={isSmartMode ? '关闭智能模式' : '开启智能模式'}
          >
            <Sparkles size={12} />
            <span className="hidden sm:inline">智能</span>
          </button>

          {/* Speed */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors',
                showSpeedMenu
                  ? 'bg-coral/10 text-coral'
                  : 'text-ink/60 hover:text-ink hover:bg-cream-soft'
              )}
              title="倍速"
              aria-label={showSpeedMenu ? '关闭倍速选择' : '打开倍速选择'}
            >
              <Gauge size={12} />
              <span className="font-mono">{playbackRate}x</span>
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-white rounded-lg shadow-lg border border-hairline py-1 z-50 min-w-[80px]">
                {speeds.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      onChangeSpeed(s);
                      setShowSpeedMenu(false);
                    }}
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

          {/* Fullscreen */}
          <button
            className="p-1.5 rounded-lg text-ink/60 hover:text-ink hover:bg-cream-soft transition-colors"
            title="全屏"
            aria-label="全屏"
          >
            <Maximize size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
