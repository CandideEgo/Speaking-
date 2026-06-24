"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Mic, MicOff, RotateCcw, Loader2 } from "lucide-react";
import { AudioWaveform } from "./AudioWaveform";

interface FreePracticeResult {
  id: string;
  transcript: string;
  fluency: number;
  feedback: string;
  audio_duration: number | null;
  mode: string;
}

export default function SpeakingRecorder() {
  const [state, setState] = useState<"idle" | "recording" | "analyzing" | "result">("idle");
  const [result, setResult] = useState<FreePracticeResult | null>(null);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      liveStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        // Stop live stream
        stream.getTracks().forEach((t) => t.stop());
        liveStreamRef.current = null;

        setState("analyzing");

        try {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const form = new FormData();
          form.append("audio", blob, "recording.webm");
          form.append("mode", "free_speaking");

          const res = await api<FreePracticeResult>("/api/v1/speaking/free-practice", {
            method: "POST",
            body: form,
            headers: {} as Record<string, string>,
          });

          setResult({
            id: res.id,
            transcript: res.transcript,
            fluency: res.fluency,
            feedback: res.feedback,
            audio_duration: res.audio_duration,
            mode: res.mode,
          });
          setState("result");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "提交失败");
          setState("idle");
        }
      };

      recorder.start();
      setState("recording");
      setSeconds(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch {
      toast.error("无法访问麦克风，请检查权限");
    }
  }, []);

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function restart() {
    setResult(null);
    setState("idle");
    setSeconds(0);
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Fluency score color
  const fluencyColor =
    result && result.fluency >= 80
      ? "text-emerald-600"
      : result && result.fluency >= 60
        ? "text-amber-500"
        : "text-coral";

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Recording state */}
      {state === "idle" && (
        <>
          <button
            onClick={startRecording}
            className="group relative flex h-24 w-24 items-center justify-center rounded-full bg-coral text-white shadow-lg shadow-coral/25 transition-all hover:scale-105 hover:shadow-xl hover:shadow-coral/30 active:scale-95"
            aria-label="开始录音"
          >
            <Mic size={36} className="transition-transform group-hover:scale-110" />
          </button>
          <p className="text-sm text-muted-foreground">点击开始自由口语练习</p>
        </>
      )}

      {state === "recording" && (
        <>
          {/* Waveform */}
          <div className="flex items-center justify-center h-10">
            <AudioWaveform stream={liveStreamRef.current} barCount={40} />
          </div>

          {/* Timer */}
          <p className="font-mono text-2xl font-medium text-ink tabular-nums">
            {formatTime(seconds)}
          </p>

          {/* Stop button */}
          <button
            onClick={stopRecording}
            className="group relative flex h-24 w-24 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/25 transition-all hover:scale-105 active:scale-95"
            aria-label="停止录音"
          >
            <MicOff size={36} />
            {/* Pulsing ring */}
            <span className="absolute inset-0 rounded-full border-4 border-red-400 animate-ping opacity-30" />
          </button>
          <p className="text-sm text-muted-foreground">录音中，点击停止</p>
        </>
      )}

      {state === "analyzing" && (
        <>
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-cream-soft">
            <Loader2 size={36} className="animate-spin text-coral" />
          </div>
          <p className="text-sm text-muted-foreground">分析中...</p>
        </>
      )}

      {state === "result" && result && (
        <>
          {/* Fluency score */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-cream-soft">
              <span className={cn("text-3xl font-display font-semibold", fluencyColor)}>
                {Math.round(result.fluency)}
              </span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-caption-wide text-muted-foreground">
              流利度
            </span>
          </div>

          {/* Transcript */}
          {result.transcript && (
            <div className="w-full max-w-md rounded-lg border border-hairline bg-canvas p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-caption-wide text-muted-foreground">
                你的表达
              </p>
              <p className="text-sm text-ink leading-relaxed">{result.transcript}</p>
            </div>
          )}

          {/* Feedback */}
          {result.feedback && (
            <div className="w-full max-w-md rounded-lg border border-hairline bg-canvas p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-caption-wide text-muted-foreground">
                AI 反馈
              </p>
              <p className="text-sm text-ink leading-relaxed">{result.feedback}</p>
            </div>
          )}

          {/* Duration */}
          {result.audio_duration && (
            <p className="text-xs text-muted-foreground">
              录音时长 {Math.round(result.audio_duration)} 秒
            </p>
          )}

          {/* Restart button */}
          <button onClick={restart} className="btn-secondary">
            <RotateCcw size={16} /> 再试一次
          </button>
        </>
      )}
    </div>
  );
}
