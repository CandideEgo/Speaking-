"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

/** Hook encapsulating the speaking/recording lifecycle.
 *
 * Manages: mic stream acquisition, MediaRecorder lifecycle, audio blob
 * creation, and state transitions (idle → listening → reviewing → idle).
 *
 * @param requireAuth — callback that returns false if user is not authenticated
 *   (triggers redirect). The hook calls this before starting a recording.
 * @param options.timer — if true, track recording duration in seconds
 *   (used by the free-speaking SpeakingRecorder component).
 */
export function useSpeakingRecorder(
  requireAuth: () => boolean,
  options?: { timer?: boolean },
) {
  const [speakingActive, setSpeakingActive] = useState(false);
  const [speakingState, setSpeakingState] = useState<
    "idle" | "listening" | "reviewing"
  >("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(
    null,
  );
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track audioUrl in a ref so the unmount cleanup can revoke the latest URL.
  const audioUrlRef = useRef<string | null>(null);
  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  // Revoke the object URL and clear recording state on unmount.
  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      recordingStream?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopSpeaking() {
    if (mediaRecorderRef.current?.state === "recording")
      mediaRecorderRef.current.stop();
    recordingStream?.getTracks().forEach((t) => t.stop());
    setRecordingStream(null);
    setSpeakingState("idle");
    setSpeakingActive(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setSeconds(0);
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
        // Stop timer if active
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
      r.start();
      setSpeakingState("listening");
      // Optional timer for free-speaking mode
      if (options?.timer) {
        setSeconds(0);
        timerRef.current = setInterval(() => {
          setSeconds((s) => s + 1);
        }, 1000);
      }
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
    setSeconds(0);
  }

  return {
    speakingActive,
    speakingState,
    audioUrl,
    recordingStream,
    seconds,
    startRecording,
    stopRecording,
    stopSpeaking,
    reRecord,
  };
}
