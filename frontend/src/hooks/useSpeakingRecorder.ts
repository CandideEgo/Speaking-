"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";

/** Hook encapsulating the speaking/recording lifecycle for the watch page.
 *
 * Manages: mic stream acquisition, MediaRecorder lifecycle, audio blob
 * creation, and state transitions (idle → listening → reviewing → idle).
 *
 * @param requireAuth — callback that returns false if user is not authenticated
 *   (triggers redirect). The hook calls this before starting a recording.
 */
export function useSpeakingRecorder(requireAuth: () => boolean) {
  const [speakingActive, setSpeakingActive] = useState(false);
  const [speakingState, setSpeakingState] = useState<
    "idle" | "listening" | "reviewing"
  >("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(
    null,
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function stopSpeaking() {
    if (mediaRecorderRef.current?.state === "recording")
      mediaRecorderRef.current.stop();
    recordingStream?.getTracks().forEach((t) => t.stop());
    setRecordingStream(null);
    setSpeakingState("idle");
    setSpeakingActive(false);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  }

  async function startRecording() {
    if (!requireAuth()) return;
    setSpeakingActive(true);
    try {
      // echoCancellation + noiseSuppression 提升跟读音质
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setRecordingStream(stream);
      // 探测浏览器支持的 mimeType，旧 Safari 不支持 webm
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const r = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = r;
      chunksRef.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      r.onstop = () => {
        setAudioUrl(
          URL.createObjectURL(
            new Blob(chunksRef.current, { type: mimeType || "audio/webm" }),
          ),
        );
        setSpeakingState("reviewing");
        stream.getTracks().forEach((t) => t.stop());
        setRecordingStream(null);
      };
      r.start();
      setSpeakingState("listening");
    } catch {
      setSpeakingActive(false);
      toast.error("麦克风访问失败，请检查浏览器权限");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function reRecord() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setSpeakingState("idle");
  }

  return {
    speakingActive,
    speakingState,
    audioUrl,
    recordingStream,
    startRecording,
    stopRecording,
    stopSpeaking,
    reRecord,
  };
}
