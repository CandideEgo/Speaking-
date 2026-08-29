"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/**
 * WaveformCompare — D10 原声/录音波形对比（不做任何评分，仅视觉参照）。
 *
 * 上行显示当前句原声片段的包络（尽力而为：解码视频文件后按字幕时间切片，
 * 失败时降级为仅显示录音波形），下行显示用户录音的包络。包络采样 200 桶，
 * 解码完成后同步绘制，满足 <500ms 渲染要求。
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

function WaveCanvas({
  envelope,
  color,
  label,
}: {
  envelope: number[] | null;
  color: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !envelope) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const barWidth = w / BUCKETS - 1;
    ctx.fillStyle = color;
    for (let i = 0; i < envelope.length; i++) {
      const barHeight = Math.max(1.5, envelope[i] * (h - 2));
      const x = i * (barWidth + 1);
      const y = (h - barHeight) / 2;
      ctx.globalAlpha = 0.45 + envelope[i] * 0.55;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;
  }, [envelope, color]);

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[11px] text-muted text-right">{label}</span>
      {envelope ? (
        <canvas ref={canvasRef} width={400} height={28} className="flex-1 rounded" />
      ) : (
        <span className="flex-1 text-[11px] text-muted-soft py-1.5">波形暂不可用</span>
      )}
    </div>
  );
}

export function WaveformCompare({
  recordingBlob,
  recordingUrl,
  originalUrl,
  originalClip,
  onPlayOriginal,
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ORIGINAL_FETCH_TIMEOUT_MS);
    fetch(originalUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => computeClippedEnvelope(data, originalClip.start, originalClip.end))
      .then((env) => setOrigEnv(env))
      .catch(() => setOrigEnv(null));
    return () => {
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

  return (
    <div className="space-y-1.5">
      {originalUrl && (
        <div className="flex items-center gap-2">
          <WaveformCompareRow
            envelope={origEnv}
            color="#0e7490"
            label="原声"
            onPlay={onPlayOriginal}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <WaveformCompareRow
          envelope={recEnv}
          color="#ff5a1f"
          label="我的"
          onPlay={recordingUrl ? toggleRecording : undefined}
          playing={playing}
        />
      </div>
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

function WaveformCompareRow({
  envelope,
  color,
  label,
  onPlay,
  playing,
}: {
  envelope: number[] | null;
  color: string;
  label: string;
  onPlay?: () => void;
  playing?: boolean;
}) {
  return (
    <>
      {onPlay ? (
        <button
          type="button"
          aria-label={playing ? `暂停${label}` : `播放${label}`}
          onClick={onPlay}
          className="w-6 h-6 shrink-0 rounded-full bg-surface-soft hover:bg-hairline
            flex items-center justify-center text-muted transition-colors cursor-pointer"
        >
          {playing ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      <div className="flex-1">
        <WaveCanvas envelope={envelope} color={color} label={label} />
      </div>
    </>
  );
}
