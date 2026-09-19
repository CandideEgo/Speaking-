"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Subtitle } from "@/types";

/**
 * useSentenceShadowing — D10 逐句跟读模式状态机。
 *
 * 循环：播放当前句 → 播到句尾自动暂停并开录 → 用户停止录音进入回放态
 * → 「下一句」继续。中途可随时退出，恢复普通播放。
 *
 * 仅适用于 HTML5 本地播放（YouTube IFrame 无法精确控制时序，调用方需
 * 在 isYtMode 时禁用）。与手动跟读共用 useSpeakingRecorder，互不破坏：
 * 退出模式即回到手动流程。
 */

export type SentenceShadowingPhase = "playing" | "recording" | "reviewing";

interface UseSentenceShadowingOptions {
  subtitles: Subtitle[] | null | undefined;
  currentIndex: number;
  setCurrentIndex: (idx: number) => void;
  seekTo: (t: number) => void;
  play: () => void;
  pause: () => void;
  /** useSpeakingRecorder 的状态（录音生命周期仍由它管理）。 */
  speakingState: "idle" | "listening" | "reviewing";
  startRecording: () => void;
  stopSpeaking: () => void;
  reRecord: () => void;
  /** 推进到下一句前调用（页面借此重置上传/满意标记等局部状态）。 */
  onAdvance?: () => void;
}

interface UseSentenceShadowingReturn {
  /** 逐句模式是否开启。 */
  active: boolean;
  /** 当前所处环节；未开启时为 null。 */
  phase: SentenceShadowingPhase | null;
  /** 从当前句开启逐句跟读。 */
  start: () => void;
  /** 退出逐句模式（停止录音、恢复普通播放）。 */
  exit: () => void;
  /** 推进到下一句并继续循环；已是最后一句时退出模式。 */
  next: () => void;
  /** 供 timeupdate tick 调用：句尾自动暂停并开录。 */
  handleTime: (t: number) => void;
}

export function useSentenceShadowing({
  subtitles,
  currentIndex,
  setCurrentIndex,
  seekTo,
  play,
  pause,
  speakingState,
  startRecording,
  stopSpeaking,
  reRecord,
  onAdvance,
}: UseSentenceShadowingOptions): UseSentenceShadowingReturn {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<SentenceShadowingPhase | null>(null);

  // handleTime 会被页面层 useCallback 持有（避免重建），用 ref 读最新值。
  const activeRef = useRef(false);
  const phaseRef = useRef<SentenceShadowingPhase | null>(null);
  const subtitlesRef = useRef(subtitles);
  const currentIndexRef = useRef(currentIndex);
  const optsRef = useRef({ seekTo, play, pause, startRecording, onAdvance });

  useEffect(() => {
    subtitlesRef.current = subtitles;
    currentIndexRef.current = currentIndex;
    optsRef.current = { seekTo, play, pause, startRecording, onAdvance };
  }, [subtitles, currentIndex, seekTo, play, pause, startRecording, onAdvance]);

  const setPhaseBoth = useCallback((p: SentenceShadowingPhase | null) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const start = useCallback(() => {
    const subs = subtitlesRef.current;
    const idx = currentIndexRef.current;
    const sub = subs?.[idx];
    if (!sub) return;
    const { seekTo, play } = optsRef.current;
    activeRef.current = true;
    setActive(true);
    setPhaseBoth("playing");
    seekTo(sub.start_time);
    play();
  }, [setPhaseBoth]);

  const exit = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setPhaseBoth(null);
    // 正在录音时一并收尾，避免残留麦克风占用。
    stopSpeaking();
  }, [setPhaseBoth, stopSpeaking]);

  const next = useCallback(() => {
    const subs = subtitlesRef.current;
    const idx = currentIndexRef.current;
    if (!subs || idx >= subs.length - 1) {
      // 已是最后一句：静默退出循环，保留回放态（不清录音结果）。
      activeRef.current = false;
      setActive(false);
      setPhaseBoth(null);
      return;
    }
    const nextSub = subs[idx + 1];
    if (!nextSub) return;
    optsRef.current.onAdvance?.();
    reRecord();
    setCurrentIndex(idx + 1);
    optsRef.current.seekTo(nextSub.start_time);
    optsRef.current.play();
    setPhaseBoth("playing");
  }, [reRecord, setCurrentIndex, setPhaseBoth]);

  // 句尾检测：由页面 timeupdate tick 驱动。
  const handleTime = useCallback(
    (t: number) => {
      if (!activeRef.current || phaseRef.current !== "playing") return;
      const sub = subtitlesRef.current?.[currentIndexRef.current];
      if (!sub) return;
      if (t >= sub.end_time - 0.05) {
        optsRef.current.pause();
        setPhaseBoth("recording");
        optsRef.current.startRecording();
      }
    },
    [setPhaseBoth]
  );

  // 录音结束（speakingState → reviewing）时同步阶段。
  useEffect(() => {
    if (!activeRef.current) return;
    if (phaseRef.current === "recording" && speakingState === "reviewing") {
      setPhaseBoth("reviewing");
    }
  }, [speakingState, setPhaseBoth]);

  return { active, phase, start, exit, next, handleTime };
}
