"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Subtitle } from "@/types";

/**
 * Subtitle timeline (canvas editor B-F2 + B-F4). Renders one block per
 * subtitle positioned by start/end time on a horizontally-scrollable track,
 * with a time ruler and a playhead that tracks the player's currentTime.
 *
 * Interactions:
 *  - Click track / block -> seek the player.
 *  - Drag a block body -> shift start/end together (keep duration). (B-F4)
 *  - Drag a block's left/right edge -> resize start/end. (B-F4)
 *  - On pointer up, the new timing is committed via ``onSaveTiming``; the
 *    backend ``_validate_timing`` rejects overlaps and the timeline rolls back.
 *
 * The playhead is moved via rAF + direct DOM mutation (no per-frame React
 * re-render); the block layer only re-renders when ``subtitles`` or the
 * in-flight drag changes.
 */
const PX_PER_SEC = 12; // 12px/s -> a 4s subtitle is ~48px (readable); 12min video ~8.6kpx (scroll)
const RULER_HEIGHT = 22;
const BLOCK_HEIGHT = 26;
const MIN_BLOCK_WIDTH = 28; // below this, blocks clip their text and show only the index
const MIN_DURATION = 0.2; // seconds - floor so a resized block never inverts
const EDGE_HANDLE = 8; // px - the grab width on each edge for resize

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
  /** Commit a timing edit (B-F4 drag/resize). Returns the updated subtitle on
   *  success; throws on backend rejection (overlap) so the timeline rolls back.
   *  Omit to disable drag/resize (read-only timeline). */
  onSaveTiming?: (
    subId: string,
    patch: { start_time: number; end_time: number }
  ) => Promise<Subtitle>;
}

/** Which part of a block a drag is acting on. */
type DragMode = "move" | "resize-start" | "resize-end";

interface DragState {
  subId: string;
  mode: DragMode;
  /** The block's start/end at drag start (seconds). */
  origStart: number;
  origEnd: number;
  /** Pointer x at drag start (px, page coords). */
  startX: number;
}

export function SubtitleTimeline({
  subtitles,
  duration,
  videoRef,
  onSeek,
  currentIndex,
  onSaveTiming,
}: SubtitleTimelineProps) {
  const playheadRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // In-flight drag: the block being dragged shows a live (uncommitted) timing
  // override so the user sees the move/resize in real time. Cleared on pointer
  // up after committing (or rolling back on error).
  const [drag, setDrag] = useState<DragState | null>(null);
  const [liveTiming, setLiveTiming] = useState<{ id: string; start: number; end: number } | null>(
    null
  );
  const [savingId, setSavingId] = useState<string | null>(null);

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
    // A click that follows a drag (pointerup -> click) would re-seek; suppress
    // clicks right after a drag completes so the player doesn't jump.
    if (dragJustEndedRef.current) {
      dragJustEndedRef.current = false;
      return;
    }
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left + track.scrollLeft;
    onSeek(Math.max(0, x / PX_PER_SEC));
  };

  // --- B-F4: block drag (move) / edge resize ---
  const dragJustEndedRef = useRef(false);

  function startDrag(e: React.PointerEvent, sub: Subtitle, mode: DragMode) {
    if (!onSaveTiming) return; // read-only timeline
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      subId: sub.id,
      mode,
      origStart: sub.start_time,
      origEnd: sub.end_time,
      startX: e.clientX,
    });
  }

  function onDragMove(e: React.PointerEvent) {
    if (!drag) return;
    const dt = (e.clientX - drag.startX) / PX_PER_SEC; // signed delta in seconds
    let start = drag.origStart;
    let end = drag.origEnd;
    if (drag.mode === "move") {
      const dur = drag.origEnd - drag.origStart;
      start = Math.max(0, drag.origStart + dt);
      end = start + dur;
    } else if (drag.mode === "resize-start") {
      start = Math.min(drag.origEnd - MIN_DURATION, Math.max(0, drag.origStart + dt));
    } else {
      // resize-end
      end = Math.max(drag.origStart + MIN_DURATION, drag.origEnd + dt);
    }
    setLiveTiming({ id: drag.subId, start, end });
  }

  async function endDrag(e: React.PointerEvent) {
    if (!drag) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointerId may already be released */
    }
    const sub = subtitles.find((s) => s.id === drag.subId);
    const live = liveTiming;
    if (!sub || !live || !onSaveTiming) {
      setDrag(null);
      setLiveTiming(null);
      return;
    }
    // Nothing changed -> bail without a network round-trip.
    const changed =
      Math.abs(live.start - sub.start_time) > 0.01 || Math.abs(live.end - sub.end_time) > 0.01;
    if (!changed) {
      setDrag(null);
      setLiveTiming(null);
      return;
    }
    setSavingId(drag.subId);
    try {
      await onSaveTiming(drag.subId, {
        start_time: Math.round(live.start * 100) / 100,
        end_time: Math.round(live.end * 100) / 100,
      });
    } catch {
      // Backend rejected (overlap) - roll back the live override so the block
      // snaps back to its committed position. The page-level handler already
      // toasted the error.
      setLiveTiming(null);
    } finally {
      setSavingId(null);
      setDrag(null);
      setLiveTiming(null);
      // Suppress the synthetic click that fires right after pointerup.
      dragJustEndedRef.current = true;
      setTimeout(() => {
        dragJustEndedRef.current = false;
      }, 0);
    }
  }

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
              // Apply the in-flight drag override so the block follows the pointer.
              const live = liveTiming?.id === sub.id ? liveTiming : null;
              const start = live ? live.start : sub.start_time;
              const end = live ? live.end : sub.end_time;
              const left = start * PX_PER_SEC;
              const width = Math.max(MIN_BLOCK_WIDTH, (end - start) * PX_PER_SEC);
              const isCurrent = sub.sentence_index === currentIndex;
              const narrow = width < MIN_BLOCK_WIDTH + 24;
              const isDragging = drag?.subId === sub.id;
              const isSaving = savingId === sub.id;
              const draggable = !!onSaveTiming;
              return (
                <div
                  key={sub.id}
                  onPointerDown={draggable ? (e) => startDrag(e, sub, "move") : undefined}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onClick={(e) => {
                    // A bare click (no drag) seeks; a drag's terminal click is
                    // suppressed via dragJustEndedRef at the track level, but
                    // stopPropagation here keeps the block click from also seeking
                    // via the track handler.
                    if (isDragging) return;
                    e.stopPropagation();
                    onSeek(sub.start_time);
                  }}
                  title={`#${sub.sentence_index + 1} ${start.toFixed(1)}s–${end.toFixed(1)}s\n${sub.text_en.slice(0, 80)}`}
                  className={cn(
                    "absolute top-1.5 rounded-md border px-1.5 flex items-center overflow-hidden",
                    isCurrent
                      ? "bg-brand-500/15 border-brand-500 text-brand-700"
                      : "bg-surface-soft border-hairline text-ink hover:border-ink/40 hover:bg-surface-card",
                    isDragging && "opacity-80 shadow-lift cursor-grabbing",
                    draggable && !isDragging && "cursor-grab",
                    isSaving && "animate-pulse"
                  )}
                  style={{ left, width, height: BLOCK_HEIGHT, touchAction: "none" }}
                >
                  <span className="text-[9px] font-mono text-muted-soft shrink-0 mr-1">
                    {sub.sentence_index + 1}
                  </span>
                  {!narrow && (
                    <span className="text-[10px] leading-none truncate">
                      {sub.text_en || "（空）"}
                    </span>
                  )}
                  {/* Edge resize handles (B-F4). Only render when draggable and
                      the block is wide enough to grab an edge without it being
                      the whole block. */}
                  {draggable && width >= EDGE_HANDLE * 2 + 8 && (
                    <>
                      <div
                        onPointerDown={(e) => startDrag(e, sub, "resize-start")}
                        className="absolute left-0 top-0 bottom-0 cursor-ew-resize"
                        style={{ width: EDGE_HANDLE }}
                        aria-label="拖动调整开始时间"
                      />
                      <div
                        onPointerDown={(e) => startDrag(e, sub, "resize-end")}
                        className="absolute right-0 top-0 bottom-0 cursor-ew-resize"
                        style={{ width: EDGE_HANDLE }}
                        aria-label="拖动调整结束时间"
                      />
                    </>
                  )}
                </div>
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
