"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { mediaUrl } from "@/lib/api";
import { formatTime } from "@/lib/format";

export function ClipPlayer({ src, start, end }: { src: string; start: number; end: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [range, setRange] = useState({ start, end });
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setRange({ start, end });
    setError(false);
    setPlaying(false);
    const audio = ref.current;
    if (audio) {
      audio.pause();
      audio.currentTime = start;
    }
  }, [src, start, end]);
  async function replay() {
    const audio = ref.current;
    if (!audio) return;
    setError(false);
    audio.currentTime = range.start;
    audio.playbackRate = rate;
    try {
      await audio.play();
    } catch {
      setError(true);
    }
  }
  return (
    <section
      className="rounded-lg border border-hairline bg-surface-soft p-4 sm:p-5"
      aria-label="听力播放器"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-copy font-semibold text-ink">
          <Headphones size={18} aria-hidden /> 听原声，写下你听到的
        </h2>
        <span className="font-mono text-caption tabular-nums text-muted">
          {formatTime(range.start)}–{formatTime(range.end)}
        </span>
      </div>
      <audio
        ref={ref}
        src={mediaUrl(src, { withToken: true })}
        preload="metadata"
        controls
        className="w-full"
        aria-label="练习原声"
        onError={() => setError(true)}
        onLoadedMetadata={() => {
          if (ref.current) {
            ref.current.currentTime = range.start;
            ref.current.playbackRate = rate;
          }
        }}
        onPlay={() => {
          setPlaying(true);
          const a = ref.current;
          if (a && (a.currentTime < range.start || a.currentTime >= range.end))
            a.currentTime = range.start;
        }}
        onPause={() => setPlaying(false)}
        onSeeking={() => {
          const a = ref.current;
          if (a && a.currentTime < range.start - 0.05) a.currentTime = range.start;
          if (a && a.currentTime > range.end) a.currentTime = range.end;
        }}
        onTimeUpdate={() => {
          const a = ref.current;
          if (a && a.currentTime >= range.end - 0.03) {
            if (loop) {
              a.currentTime = range.start;
            } else {
              a.pause();
              a.currentTime = range.end;
            }
          }
        }}
      />
      {error && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center gap-3 text-meta text-error-text"
        >
          原声加载失败，请检查网络后重试。
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(false);
              ref.current?.load();
            }}
          >
            重新加载原声
          </Button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button icon={playing ? RotateCcw : Play} size="sm" onClick={replay}>
          {playing ? "重播片段" : "播放片段"}
        </Button>
        <label className="flex items-center gap-2 text-meta text-body">
          速度
          <Select
            aria-label="播放速度"
            value={rate}
            onChange={(e) => {
              const value = Number(e.target.value);
              setRate(value);
              if (ref.current) ref.current.playbackRate = value;
            }}
            className="h-9 w-24"
          >
            {[0.5, 0.75, 1, 1.25, 1.5].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-meta text-body">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
            className="size-4 accent-brand-500"
          />
          循环片段
        </label>
      </div>
      <details className="mt-3 border-t border-hairline pt-3 text-meta text-body">
        <summary className="cursor-pointer">调整播放范围</summary>
        <p className="mt-2 text-caption text-muted">在本句时间范围内缩短片段，集中听清一小段。</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label>
            起点（秒）
            <input
              aria-label="片段起点"
              type="number"
              step="0.1"
              min={start}
              max={range.end - 0.1}
              value={range.start}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v))
                  setRange((r) => ({ ...r, start: Math.min(r.end - 0.1, Math.max(start, v)) }));
              }}
              className="ml-2 w-24 rounded-sm border border-hairline bg-canvas px-2 py-1"
            />
          </label>
          <label>
            终点（秒）
            <input
              aria-label="片段终点"
              type="number"
              step="0.1"
              min={range.start + 0.1}
              max={end}
              value={range.end}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v))
                  setRange((r) => ({ ...r, end: Math.max(r.start + 0.1, Math.min(end, v)) }));
              }}
              className="ml-2 w-24 rounded-sm border border-hairline bg-canvas px-2 py-1"
            />
          </label>
          <Button size="sm" variant="text" onClick={() => setRange({ start, end })}>
            恢复整句
          </Button>
        </div>
      </details>
    </section>
  );
}
