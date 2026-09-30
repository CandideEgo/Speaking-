"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AudioWaveformProps {
  /** Active MediaStream from getUserMedia */
  stream: MediaStream | null;
  /** Bar color (default coral) */
  color?: string;
  /** Number of bars (default 32) */
  barCount?: number;
  className?: string;
}

interface AudioGraph {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
}

/** 建音频图；麦克风流的任何一步失败都返回 null，让调用方退化成静止线。 */
function buildGraph(stream: MediaStream): AudioGraph | null {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  try {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    source.connect(analyser);
    return { ctx, source, analyser };
  } catch {
    void ctx.close().catch(() => {});
    return null;
  }
}

/**
 * Real-time audio waveform visualizer using Web Audio API AnalyserNode.
 * Renders a row of bars whose height reflects the current audio level.
 *
 * 尺寸按**容器实宽** + devicePixelRatio 画（#26 点名的现状缺口：以前是写死
 * `<canvas width={200}>` 且没有任何宽度类，于是又窄又糊，跟读抽屉里还撑不满）。
 */
export function AudioWaveform({
  stream,
  color = "#ff5a1f",
  barCount = 32,
  className,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!stream || !canvas) return;

    // 取不到麦克风音频图（测试里的假 stream、浏览器不支持）只让波形退化成静止线，
    // 不该把整个练习面板一起打挂。
    const graph = buildGraph(stream);
    if (!graph) return;

    const { ctx, source, analyser } = graph;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      source.disconnect();
      void ctx.close().catch(() => {});
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const paint = ctx2d;
    const el = canvas;
    let raf = 0;

    /** 按 CSS 尺寸 × dpr 对齐画布位图，避免拉伸发虚。 */
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(el.clientWidth * dpr));
      const h = Math.max(1, Math.round(el.clientHeight * dpr));
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
    };

    function draw() {
      analyser.getByteFrequencyData(dataArray);

      const w = el.width;
      const h = el.height;
      paint.clearRect(0, 0, w, h);

      const step = Math.max(1, Math.floor(dataArray.length / barCount));
      const barWidth = Math.max(1, w / barCount - 1);

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] / 255;
        const barHeight = Math.max(2, val * h);
        const x = i * (barWidth + 1);
        const y = (h - barHeight) / 2;

        paint.fillStyle = color;
        paint.globalAlpha = 0.4 + val * 0.6;
        paint.fillRect(x, y, barWidth, barHeight);
      }
      paint.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    draw();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      source.disconnect();
      analyser.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [stream, color, barCount]);

  return <canvas ref={canvasRef} className={cn("block h-8 w-full rounded-md", className)} />;
}
