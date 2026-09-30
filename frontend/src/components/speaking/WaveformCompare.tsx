"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WaveformCompare — D10 原声/录音波形对比（不做任何评分，仅视觉参照）。
 *
 * 上行显示当前句原声片段的包络（尽力而为：解码视频文件后按字幕时间切片，
 * 失败时降级为仅显示录音波形），下行显示用户录音的包络。包络采样 200 桶，
 * 解码完成后同步绘制，满足 <500ms 渲染要求。
 *
 * 尺寸按**容器实宽** + dpr 画（#26 点名的现状缺口：以前写死 `<canvas width={400}>`，
 * 在 303px 的口袋里撑破容器）。`merged` 把两条合成一张（原声上 / 我的下）。
 */

const BUCKETS = 200;
/** 原声拉取超时（毫秒）：超时则降级隐藏原声波形。 */
const ORIGINAL_FETCH_TIMEOUT_MS = 8000;

interface WaveformCompareProps {
  /** 用户录音 blob（用于解码波形）。 */
  recordingBlob: Blob | null;
  /** 录音回放地址（组件内提供播放按钮）。 */
  recordingUrl: string | null;
  /** 原声视频文件地址；null（如 YouTube 模式）时不显示原声行。 */
  originalUrl?: string | null;
  /** 原声切片范围（秒）。 */
  originalClip?: { start: number; end: number } | null;
  /** 点击「听原声」时由页面驱动（seek 视频到句首播放）。 */
  onPlayOriginal?: () => void;
  /** 「合并一条」档：原声在上、我的在下，共用一条画布。 */
  merged?: boolean;
  /** 触控目标档：`lg` = 44px（跟读抽屉里用，见 #26 ③）。 */
  minTarget?: "sm" | "lg";
}

/** Decode audio and reduce channel data to a normalized peak envelope. */
async function computeEnvelope(data: ArrayBuffer): Promise<number[]> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(data);
    const ch = buf.getChannelData(0);
    const start = 0;
    const end = ch.length;
    const span = Math.max(1, end - start);
    const step = Math.max(1, Math.floor(span / BUCKETS));
    const env: number[] = [];
    for (let i = 0; i < BUCKETS; i++) {
      let max = 0;
      const s = start + i * step;
      const e = Math.min(s + step, end);
      // Stride by 4 samples: envelope fidelity doesn't need every sample.
      for (let j = s; j < e; j += 4) {
        const v = Math.abs(ch[j]);
        if (v > max) max = v;
      }
      env.push(max);
    }
    const peak = Math.max(...env, 0.001);
    return env.map((v) => v / peak);
  } finally {
    await ctx.close();
  }
}

/** Same as computeEnvelope but clipped to a [start, end] second range. */
async function computeClippedEnvelope(
  data: ArrayBuffer,
  clipStart: number,
  clipEnd: number
): Promise<number[]> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(data);
    const ch = buf.getChannelData(0);
    const s = Math.max(0, Math.floor(clipStart * buf.sampleRate));
    const e = Math.min(ch.length, Math.max(s + 1, Math.floor(clipEnd * buf.sampleRate)));
    const span = e - s;
    const step = Math.max(1, Math.floor(span / BUCKETS));
    const env: number[] = [];
    for (let i = 0; i < BUCKETS; i++) {
      let max = 0;
      const bs = s + i * step;
      const be = Math.min(bs + step, e);
      for (let j = bs; j < be; j += 4) {
        const v = Math.abs(ch[j]);
        if (v > max) max = v;
      }
      env.push(max);
    }
    const peak = Math.max(...env, 0.001);
    return env.map((v) => v / peak);
  } finally {
    await ctx.close();
  }
}

interface WaveRow {
  envelope: number[] | null;
  color: string;
  /** null = 居中一条；"up"/"down" = 上下分栏（合并档）。 */
  half: null | "up" | "down";
}

/** 按容器实宽 × dpr 画包络；容器尺寸一变就重画。 */
function WaveCanvas({ rows, className }: { rows: WaveRow[]; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const paint = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      const bitmapW = Math.round(w * dpr);
      const bitmapH = Math.round(h * dpr);
      if (canvas.width !== bitmapW) canvas.width = bitmapW;
      if (canvas.height !== bitmapH) canvas.height = bitmapH;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const barWidth = Math.max(1, w / BUCKETS - 1);

      for (const row of rows) {
        if (!row.envelope) continue;
        const half = row.half;
        for (let i = 0; i < row.envelope.length; i++) {
          const v = row.envelope[i];
          const barHeight = half ? Math.max(1.2, v * (h / 2 - 2)) : Math.max(1.5, v * (h - 4));
          const x = i * (barWidth + 1);
          const y =
            half === "up" ? h / 2 - barHeight : half === "down" ? h / 2 : (h - barHeight) / 2;
          ctx.globalAlpha = 0.45 + v * 0.55;
          ctx.fillStyle = row.color;
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      }
      ctx.globalAlpha = 1;
    };

    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [rows]);

  return <canvas ref={canvasRef} className={cn("block h-7 w-full rounded", className)} />;
}

export function WaveformCompare({
  recordingBlob,
  recordingUrl,
  originalUrl,
  originalClip,
  onPlayOriginal,
  merged = false,
  minTarget = "sm",
}: WaveformCompareProps) {
  const [recEnv, setRecEnv] = useState<number[] | null>(null);
  const [origEnv, setOrigEnv] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Recording envelope (small webm blob -> fast decode).
  useEffect(() => {
    if (!recordingBlob) {
      setRecEnv(null);
      return;
    }
    let cancelled = false;
    recordingBlob
      .arrayBuffer()
      .then((data) => computeEnvelope(data))
      .then((env) => {
        if (!cancelled) setRecEnv(env);
      })
      .catch(() => {
        if (!cancelled) setRecEnv(null);
      });
    return () => {
      cancelled = true;
    };
  }, [recordingBlob]);

  // Original envelope: fetch the video file best-effort, decode, clip.
  useEffect(() => {
    if (!originalUrl || !originalClip) {
      setOrigEnv(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ORIGINAL_FETCH_TIMEOUT_MS);
    fetch(originalUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => computeClippedEnvelope(data, originalClip.start, originalClip.end))
      .then((env) => {
        if (!cancelled) setOrigEnv(env);
      })
      .catch(() => {
        if (!cancelled) setOrigEnv(null);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [originalUrl, originalClip]);

  function toggleRecording() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play().catch(() => {});
  }

  // rows 的标识要稳定，否则每次 render 都会重挂 ResizeObserver（数组字面量每次都是新对象）。
  const mergedRows = useMemo<WaveRow[]>(
    () => [
      { envelope: origEnv, color: "#0e7490", half: "up" },
      { envelope: recEnv, color: "#ff5a1f", half: "down" },
    ],
    [origEnv, recEnv]
  );
  const origRows = useMemo<WaveRow[]>(
    () => [{ envelope: origEnv, color: "#0e7490", half: null }],
    [origEnv]
  );
  const recRows = useMemo<WaveRow[]>(
    () => [{ envelope: recEnv, color: "#ff5a1f", half: null }],
    [recEnv]
  );

  const btnClass = cn(
    "shrink-0 rounded-full bg-surface-soft hover:bg-hairline flex items-center justify-center text-muted transition-colors cursor-pointer",
    minTarget === "lg" ? "w-11 h-11" : "w-6 h-6"
  );
  const iconSize = minTarget === "lg" ? 16 : 12;

  return (
    <div className="space-y-1.5">
      {merged ? (
        <div className="flex items-center gap-2">
          {onPlayOriginal && (
            <button
              type="button"
              aria-label="播放原声"
              onClick={onPlayOriginal}
              className={cn(btnClass, "gap-1 px-2 text-[11px] w-auto min-w-[44px]")}
            >
              <Play size={iconSize} className="ml-0.5" />
              原声
            </button>
          )}
          <button
            type="button"
            aria-label={playing ? "暂停我的录音" : "播放我的录音"}
            onClick={recordingUrl ? toggleRecording : undefined}
            disabled={!recordingUrl}
            className={cn(btnClass, "gap-1 px-2 text-[11px] w-auto min-w-[44px]")}
          >
            {playing ? <Pause size={iconSize} /> : <Play size={iconSize} className="ml-0.5" />}
            我的
          </button>
          <div className="min-w-0 flex-1">
            <WaveCanvas rows={mergedRows} />
          </div>
        </div>
      ) : (
        <>
          {originalUrl && (
            <div className="flex items-center gap-2">
              <PlayButton
                label="原声"
                onPlay={onPlayOriginal}
                playing={false}
                className={btnClass}
                iconSize={iconSize}
              />
              <div className="min-w-0 flex-1">
                <WaveCanvas rows={origRows} />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <PlayButton
              label="我的"
              onPlay={recordingUrl ? toggleRecording : undefined}
              playing={playing}
              className={btnClass}
              iconSize={iconSize}
            />
            <div className="min-w-0 flex-1">
              <WaveCanvas rows={recRows} />
            </div>
          </div>
        </>
      )}

      {recordingUrl && (
        <audio
          ref={audioRef}
          src={recordingUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      )}
      <p className="text-[10px] text-muted-soft">波形仅供对比参考，不做评分</p>
    </div>
  );
}

function PlayButton({
  label,
  onPlay,
  playing,
  className,
  iconSize,
}: {
  label: string;
  onPlay?: () => void;
  playing: boolean;
  className: string;
  iconSize: number;
}) {
  if (!onPlay) {
    return <span className={cn("shrink-0", className, "pointer-events-none opacity-50")} />;
  }
  return (
    <button
      type="button"
      aria-label={playing ? `暂停${label}` : `播放${label}`}
      onClick={onPlay}
      className={className}
    >
      {playing ? <Pause size={iconSize} /> : <Play size={iconSize} className="ml-0.5" />}
    </button>
  );
}
