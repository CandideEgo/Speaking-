"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Mic, MicOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AudioWaveform } from "./AudioWaveform";

export default function SpeakingRecorder() {
  const [state, setState] = useState<"idle" | "recording" | "reviewing">(
    "idle",
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
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
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

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

      recorder.onstop = () => {
        // Stop timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        // Stop live stream
        stream.getTracks().forEach((t) => t.stop());
        liveStreamRef.current = null;

        // Create playback URL instead of submitting to API
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioUrl(URL.createObjectURL(blob));
        setState("reviewing");
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
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setState("idle");
    setSeconds(0);
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

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
            <Mic
              size={36}
              className="transition-transform group-hover:scale-110"
            />
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

      {state === "reviewing" && (
        <>
          {/* Playback */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-cream-soft">
              <Mic size={36} className="text-brand-500" />
            </div>
            <p className="text-sm text-ink">录音完成，回放听自己的发音</p>
            {audioUrl && (
              <audio src={audioUrl} controls className="w-full max-w-md" />
            )}
          </div>

          {/* Restart button */}
          <Button onClick={restart} variant="secondary" icon={RotateCcw}>
            再试一次
          </Button>
        </>
      )}
    </div>
  );
}
