"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Subtitle } from "@/types";

/**
 * Read-only subtitle timeline (canvas editor B-F2). Renders one block per
 * subtitle positioned by start/end time on a horizontally-scrollable track,
 * with a time ruler and a playhead that tracks the player's currentTime.
 *
 * Clicking the track or a block seeks the player to that time. The playhead is
 * moved via rAF + direct DOM mutation (no per-frame React re-render); the
 * block layer is static - it only re-renders when `subtitles` changes.
 *
 * Time-block drag/resize (B-F4) is layered on top in a follow-up.
 */
const PX_PER_SEC = 12; // 12px/s -> a 4s subtitle is ~48px (readable); 12min video ~8.6kpx (scroll)
const RULER_HEIGHT = 22;
const BLOCK_HEIGHT = 26;
const MIN_BLOCK_WIDTH = 28; // below this, blocks clip their text and show only the index

function formatTs(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Pick a ruler tick interval so ticks land ~80-120px apart. */
function tickInterval(): number {
  const target = 100 / PX_PER_SEC; // seconds per ~100px
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const c of candidates) if (c >= target) return c;
  return 600;
}

export interface SubtitleTimelineProps {
  subtitles: Subtitle[];
  /** Video duration in seconds (drives the track width). Falls back to the last
   *  subtitle's end_time when null/zero (e.g. legacy rows). */
  duration: number | null;
  /** Player element ref. The playhead reads currentTime via rAF. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Seek the player to a time (clicks on the track / blocks). */
  onSeek: (t: number) => void;
  /** sentence_index of the currently-active subtitle (for highlight). */
  currentIndex: number;
}

export function SubtitleTimeline({
  subtitles,
  duration,
  videoRef,
  onSeek,
  currentIndex,
}: SubtitleTimelineProps) {
  const playheadRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const lastEnd = subtitles.length ? Math.max(...subtitles.map((s) => s.end_time)) : 0;
  const totalSec = Math.max(duration ?? 0, lastEnd, 1);
  const trackWidth = Math.ceil(totalSec * PX_PER_SEC);
  const tickStep = tickInterval();

  // Drive the playhead via rAF + direct DOM mutation (zero re-renders). rAF
  // also auto-pauses when the tab is hidden. Falls back gracefully when the
  // video element isn't mounted yet (returns 0 -> playhead stays at 0).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const el = playheadRef.current;
      if (v && el) {
        const left = Math.max(0, Math.min(v.currentTime, totalSec)) * PX_PER_SEC;
        el.style.transform = `translateX(${left}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, totalSec]);

  // Click on the track background -> seek to the clicked time.
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left + track.scrollLeft;
    onSeek(Math.max(0, x / PX_PER_SEC));
  };

  const ticks: number[] = [];
  for (let t = 0; t <= totalSec; t += tickStep) ticks.push(t);

  return (
    <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-hairline">
        <span className="text-xs font-semibold text-muted">时间轴</span>
        <span className="text-[10px] text-muted-soft">
          点击定位 · {subtitles.length} 句 · {formatTs(totalSec)}
        </span>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          className="relative cursor-pointer select-none"
          style={{ width: trackWidth, minWidth: "100%" }}
        >
          {/* Ruler */}
          <div className="relative border-b border-hairline" style={{ height: RULER_HEIGHT }}>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 flex items-center"
                style={{ left: t * PX_PER_SEC }}
              >
                <div className="w-px h-2 bg-hairline" />
                <span className="ml-1 text-[9px] text-muted-soft font-mono">{formatTs(t)}</span>
              </div>
            ))}
          </div>

          {/* Subtitle blocks (single lane, positioned by start_time) */}
          <div className="relative py-1.5" style={{ height: BLOCK_HEIGHT + 12 }}>
            {subtitles.map((sub) => {
              const left = sub.start_time * PX_PER_SEC;
              const width = Math.max(MIN_BLOCK_WIDTH, (sub.end_time - sub.start_time) * PX_PER_SEC);
              const isCurrent = sub.sentence_index === currentIndex;
              const narrow = width < MIN_BLOCK_WIDTH + 24;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(sub.start_time);
                  }}
                  title={`#${sub.sentence_index + 1} ${sub.start_time.toFixed(1)}s–${sub.end_time.toFixed(1)}s\n${sub.text_en.slice(0, 80)}`}
                  className={cn(
                    "absolute top-1.5 rounded-md border px-1.5 flex items-center overflow-hidden transition-colors",
                    isCurrent
                      ? "bg-brand-500/15 border-brand-500 text-brand-700"
                      : "bg-surface-soft border-hairline text-ink hover:border-ink/40 hover:bg-surface-card"
                  )}
                  style={{ left, width, height: BLOCK_HEIGHT }}
                >
                  <span className="text-[9px] font-mono text-muted-soft shrink-0 mr-1">
                    {sub.sentence_index + 1}
                  </span>
                  {!narrow && (
                    <span className="text-[10px] leading-none truncate">
                      {sub.text_en || "（空）"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Playhead - moved by rAF, pointer-events-none so it never blocks clicks. */}
          <div
            ref={playheadRef}
            className="absolute top-0 bottom-0 w-0.5 bg-error pointer-events-none z-10"
            style={{ left: 0 }}
            aria-hidden
          >
            <div className="absolute -top-0 -left-1.5 w-3 h-3 rounded-full bg-error" />
          </div>
        </div>
      </div>
    </div>
  );
}
