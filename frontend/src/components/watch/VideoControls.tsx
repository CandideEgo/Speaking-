"use client";

/**
 * VideoControls — 自定义播放器控制条（D1，产品设计规划 §D1）。
 *
 * 仅用于 HTML5 本地播放（YouTube IFrame 保留原生控件）。覆盖在 <video> 上：
 *  - 播放/暂停、进度条、时间、音量（滑杆+静音）、倍速菜单、字幕模式循环、
 *    字幕字号、全屏
 *  - 播放中闲置 3s 自动隐藏（移动端一致）；暂停/交互时显示
 *  - 移动端收纳：倍速/字幕/字号收进「更多」弹层，桌面端倍速/字幕内联
 * 快捷键由 useVideoPlayer 统一注册（空格/←→/↑↓/M/F/C/S），此处只做点击面。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Maximize, MoreHorizontal, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { PLAYBACK_RATES } from "@/hooks/useVideoPlayer";
import type { SubtitleMode } from "@/stores/watchStore";

export type SubtitleFontSize = "small" | "medium" | "large";

const SUBTITLE_MODE_LABEL: Record<SubtitleMode, string> = {
  bilingual: "双语",
  english: "英",
  chinese: "中",
  hidden: "关",
};

const FONT_SIZE_LABEL: Record<SubtitleFontSize, string> = {
  small: "小",
  medium: "中",
  large: "大",
};

const HIDE_DELAY_MS = 3000;

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 视频总时长（秒），来自视频数据。 */
  duration: number | null;
  /** 是否正在播放 —— hook 轮询校正后的单一事实源（iOS 媒体事件不可靠）。 */
  isPlaying: boolean;
  rate: number;
  setRate: (rate: number) => void;
  muted: boolean;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  subtitleMode: SubtitleMode;
  /** S 键同款循环（双语→英→中→隐藏），由 useVideoPlayer 提供。 */
  onCycleSubtitleMode: () => void;
  subtitleFontSize: SubtitleFontSize;
  onFontSizeChange: (size: SubtitleFontSize) => void;
  toggleFullscreen: () => void;
  isMobile: boolean;
  /** PiP 小窗时不渲染控制条（由调用方决定）。 */
  /** D10 跟读时间线：绿点标记已跟读句子的位置（秒），点击回到对应句。 */
  markers?: { position: number; onClick: () => void }[];
}

export function VideoControls({
  videoRef,
  duration,
  isPlaying,
  rate,
  setRate,
  muted,
  toggleMute,
  setVolume,
  subtitleMode,
  onCycleSubtitleMode,
  subtitleFontSize,
  onFontSizeChange,
  toggleFullscreen,
  isMobile,
  markers,
}: VideoControlsProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeUi] = useState(1);
  const [visible, setVisible] = useState(true);
  const [menu, setMenu] = useState<"rate" | "more" | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const total = duration ?? videoRef.current?.duration ?? 0;

  // 进度条/时间显示：timeupdate 快速路径 + 250ms 轮询兜底
  // （iOS Safari 的 timeupdate 可能停发；轮询保证进度条不冻结）。
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    el.addEventListener("timeupdate", onTime);
    const interval = setInterval(() => {
      const v = videoRef.current;
      if (v && Number.isFinite(v.currentTime)) setCurrentTime(v.currentTime);
    }, 250);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      clearInterval(interval);
    };
  }, [videoRef]);

  // 播放中闲置 3s 自动隐藏；暂停或弹层打开时常驻。
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      const el = videoRef.current;
      if (el && !el.paused) {
        setVisible(false);
        setMenu(null);
      }
    }, HIDE_DELAY_MS);
  }, [videoRef]);

  useEffect(() => {
    if (!isPlaying || menu) {
      setVisible(true);
      return;
    }
    scheduleHide();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, menu, scheduleHide]);

  function handleActivity() {
    setVisible(true);
    if (isPlaying) scheduleHide();
  }

  function togglePlayPause() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
    handleActivity();
  }

  /** 覆盖层点击：移动端切换控制条显隐，桌面端播放/暂停。 */
  function handleSurfaceClick() {
    if (menu) {
      setMenu(null);
      return;
    }
    if (isMobile) {
      setVisible((v) => !v);
    } else {
      togglePlayPause();
    }
  }

  function handleSeek(value: number) {
    const el = videoRef.current;
    if (!el || !Number.isFinite(value)) return;
    el.currentTime = value;
    setCurrentTime(value);
    handleActivity();
  }

  function handleVolumeChange(value: number) {
    setVolume(value);
    setVolumeUi(value);
    handleActivity();
  }

  const cycleSubtitle = () => {
    // 点击循环按钮：按固定顺序切换（与 S 键一致），标签即时反馈。
    onCycleSubtitleMode();
    handleActivity();
  };

  return (
    <div
      className="absolute inset-0 z-10 select-none"
      onPointerMove={handleActivity}
      onClick={handleSurfaceClick}
    >
      {/* 底部控制条 */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 px-3 pb-2 pt-8 bg-gradient-to-t from-black/75 via-black/35 to-transparent",
          "transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 进度条（D10：绿点标记已跟读句子，点击回到对应句） */}
        <div className="relative">
          <input
            type="range"
            aria-label="播放进度"
            min={0}
            max={Math.max(total, 0.1)}
            step={0.1}
            value={Math.min(currentTime, total)}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="w-full h-1.5 cursor-pointer accent-brand-500"
          />
          {markers && total > 0 && (
            <div className="absolute inset-x-0 -top-1 h-2 pointer-events-none">
              {markers.map((m, i) => (
                <button
                  key={`${i}-${m.position}`}
                  type="button"
                  aria-label={`已跟读，回到 ${formatDuration(m.position)}`}
                  title="已跟读，点击回到这一句"
                  onClick={(e) => {
                    e.stopPropagation();
                    m.onClick();
                    handleActivity();
                  }}
                  className="absolute w-2 h-2 -translate-x-1/2 rounded-full bg-success
                    ring-1 ring-black/20 hover:scale-125 transition-transform
                    pointer-events-auto cursor-pointer"
                  style={{ left: `${(Math.min(m.position, total) / total) * 100}%` }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2.5 text-white">
          {/* 播放/暂停 */}
          <button
            type="button"
            onClick={togglePlayPause}
            aria-label={isPlaying ? "暂停（空格）" : "播放（空格）"}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
          </button>

          {/* 时间 */}
          <span className="text-[11px] font-mono text-white/85 shrink-0">
            {formatDuration(currentTime)} / {formatDuration(total)}
          </span>

          {/* 桌面端：音量内联 */}
          {!isMobile && (
            <div className="flex items-center gap-1.5 ml-1">
              <button
                type="button"
                onClick={() => {
                  toggleMute();
                  handleActivity();
                }}
                aria-label={muted ? "取消静音（M）" : "静音（M）"}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors cursor-pointer"
              >
                {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                aria-label="音量（↑/↓）"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-16 h-1 cursor-pointer accent-white"
              />
            </div>
          )}

          <div className="flex-1" />

          {/* 桌面端：倍速 + 字幕模式内联 */}
          {!isMobile && (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenu(menu === "rate" ? null : "rate")}
                  aria-label="倍速（C）"
                  className="px-2 h-8 rounded-lg text-[12px] font-semibold font-mono hover:bg-white/15 transition-colors cursor-pointer"
                >
                  {rate}x
                </button>
                {menu === "rate" && (
                  <div className="absolute bottom-10 right-0 bg-black/85 backdrop-blur rounded-lg py-1 min-w-[72px]">
                    {PLAYBACK_RATES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setRate(r);
                          setMenu(null);
                        }}
                        className={cn(
                          "w-full px-3 py-1.5 text-[12px] font-mono text-left flex items-center justify-between hover:bg-white/15 cursor-pointer",
                          r === rate ? "text-brand-400" : "text-white/85"
                        )}
                      >
                        {r}x{r === rate && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={cycleSubtitle}
                aria-label={`字幕：${SUBTITLE_MODE_LABEL[subtitleMode]}（S）`}
                className="px-2 h-8 rounded-lg text-[12px] font-medium hover:bg-white/15 transition-colors cursor-pointer"
              >
                字幕·{SUBTITLE_MODE_LABEL[subtitleMode]}
              </button>
            </>
          )}

          {/* 「更多」弹层：字号常驻；移动端再收进倍速/字幕/全屏 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === "more" ? null : "more")}
              aria-label="更多设置"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors cursor-pointer"
            >
              <MoreHorizontal size={17} />
            </button>
            {menu === "more" && (
              <div className="absolute bottom-10 right-0 bg-black/85 backdrop-blur rounded-lg py-1.5 px-3 min-w-[150px] space-y-2">
                <div>
                  <p className="text-[11px] text-white/55 mb-1">字幕字号</p>
                  <div className="flex gap-1">
                    {(Object.keys(FONT_SIZE_LABEL) as SubtitleFontSize[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          onFontSizeChange(s);
                          setMenu(null);
                        }}
                        className={cn(
                          "flex-1 py-1 rounded text-[12px] transition-colors cursor-pointer",
                          subtitleFontSize === s
                            ? "bg-brand-500 text-white"
                            : "bg-white/10 text-white/80 hover:bg-white/20"
                        )}
                      >
                        {FONT_SIZE_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
                {isMobile && (
                  <>
                    <div>
                      <p className="text-[11px] text-white/55 mb-1">倍速</p>
                      <div className="flex gap-1 flex-wrap">
                        {PLAYBACK_RATES.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              setRate(r);
                              setMenu(null);
                            }}
                            className={cn(
                              "px-2 py-1 rounded text-[12px] font-mono transition-colors cursor-pointer",
                              r === rate
                                ? "bg-brand-500 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            )}
                          >
                            {r}x
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        cycleSubtitle();
                      }}
                      className="w-full py-1 rounded text-[12px] bg-white/10 text-white/80 hover:bg-white/20 transition-colors cursor-pointer"
                    >
                      字幕·{SUBTITLE_MODE_LABEL[subtitleMode]}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        toggleFullscreen();
                        setMenu(null);
                      }}
                      className="w-full py-1 rounded text-[12px] bg-white/10 text-white/80 hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Maximize size={12} /> 全屏
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 桌面端：全屏内联 */}
          {!isMobile && (
            <button
              type="button"
              onClick={() => {
                toggleFullscreen();
                handleActivity();
              }}
              aria-label="全屏（F）"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors cursor-pointer"
            >
              <Maximize size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
