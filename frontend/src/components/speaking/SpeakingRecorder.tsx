"use client";

import { Mic, MicOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AudioWaveform } from "./AudioWaveform";
import { useSpeakingRecorder } from "@/hooks/useSpeakingRecorder";

/** Standalone free-speaking recorder (no auth gate, no video context).
 *
 * Delegates the entire recording lifecycle to useSpeakingRecorder
 * and only renders the UI. Uses the timer option to show elapsed seconds.
 */
export default function SpeakingRecorder() {
  const {
    speakingState,
    audioUrl,
    recordingStream,
    seconds,
    startRecording,
    stopRecording,
    reRecord,
  } = useSpeakingRecorder(() => true, { timer: true });

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Map hook state names to UI state names
  const state = speakingState;

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

      {state === "listening" && (
        <>
          {/* Waveform */}
          <div className="flex items-center justify-center h-10">
            <AudioWaveform stream={recordingStream} barCount={40} />
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
          <Button onClick={reRecord} variant="secondary" icon={RotateCcw}>
            再试一次
          </Button>
        </>
      )}
    </div>
  );
}
