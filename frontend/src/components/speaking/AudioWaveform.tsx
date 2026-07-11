"use client";

import { useEffect, useRef } from "react";

interface AudioWaveformProps {
  /** Active MediaStream from getUserMedia */
  stream: MediaStream | null;
  /** Bar color (default coral) */
  color?: string;
  /** Number of bars (default 32) */
  barCount?: number;
}

/**
 * Real-time audio waveform visualizer using Web Audio API AnalyserNode.
 * Renders a row of bars whose height reflects the current audio level.
 */
export function AudioWaveform({ stream, color = "#e8614d", barCount = 32 }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    source.connect(analyser);
    analyserRef.current = analyser;
    sourceRef.current = source;

    const canvas = canvasRef.current;
    const drawCtx = canvas.getContext("2d");
    if (!drawCtx) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      if (!analyserRef.current || !drawCtx) return;
      analyserRef.current.getByteFrequencyData(dataArray);

      const w = canvas.width;
      const h = canvas.height;
      drawCtx.clearRect(0, 0, w, h);

      const step = Math.floor(dataArray.length / barCount);
      const barWidth = w / barCount - 1;

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] / 255;
        const barHeight = Math.max(2, val * h);
        const x = i * (barWidth + 1);
        const y = (h - barHeight) / 2;

        drawCtx.fillStyle = color;
        drawCtx.globalAlpha = 0.4 + val * 0.6;
        drawCtx.fillRect(x, y, barWidth, barHeight);
      }
      drawCtx.globalAlpha = 1;

      animFrameRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current = null;
      ctx.close();
    };
  }, [stream, color, barCount]);

  return <canvas ref={canvasRef} width={200} height={32} className="rounded-md" />;
}
