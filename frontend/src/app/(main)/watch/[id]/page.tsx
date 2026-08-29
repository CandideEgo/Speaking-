"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CoachMark } from "@/components/common/CoachMark";
import { useCoachMark } from "@/hooks/useCoachMark";
import { EndScreen, type ShadowingSentence } from "@/components/watch/EndScreen";
import { useWatchStore } from "@/stores/watchStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSpeakingRecorder } from "@/hooks/useSpeakingRecorder";
import { useShadowing, type ShadowingAttempt } from "@/hooks/useShadowing";
import { useSentenceShadowing } from "@/hooks/useSentenceShadowing";
import { useStickyPip } from "@/hooks/useStickyPip";
import { useVideoPlayer, bestVideoUrl, youtubeId } from "@/hooks/useVideoPlayer";
import { useWordLookup } from "@/hooks/useWordLookup";
import { useVideoMeta } from "@/hooks/useVideoMeta";
import { api, mediaUrl } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { track, trackWatchTime } from "@/lib/analytics";
import { findSubtitleIndex } from "@/lib/subtitles";
import type { VideoWithSubtitles } from "@/types";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import SubtitleModeTabs, { SubtitleModeRail } from "@/components/subtitle/SubtitleModeTabs";
import { WordTooltipInline } from "@/components/subtitle/WordTooltipInline";
import { ExamLevelSelector } from "@/components/watch/ExamLevelSelector";
import { UnlockPanel } from "@/components/paywall/UnlockPanel";
import { VideoControls, type SubtitleFontSize } from "@/components/watch/VideoControls";
import { AudioWaveform } from "@/components/speaking/AudioWaveform";
import { WaveformCompare } from "@/components/speaking/WaveformCompare";
import { ShadowingHistory } from "@/components/watch/ShadowingHistory";
import { shouldDisplay, wordHighlightClass, cleanToken } from "@/lib/examLevels";
import {
  ArrowLeft,
  Loader2,
  Play,
  Mic,
  Bookmark,
  Heart,
  BookOpen,
  Pencil,
  X,
  AlertCircle,
  Check,
  Layers,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import { STEP_LABELS } from "@/lib/videoStatus";

// D1：字幕字号档位 → 像素（英文行/中文行分别映射）。
const SUBTITLE_FONT_EN: Record<SubtitleFontSize, string> = {
  small: "14px",
  medium: "17px",
  large: "20px",
};
const SUBTITLE_FONT_ZH: Record<SubtitleFontSize, string> = {
  small: "12px",
  medium: "14px",
  large: "16px",
};

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const requireAuth = (): boolean => {
    if (isLoading || !isAuthenticated) {
      router.push("/login");
      return false;
    }
    return true;
  };
  const {
    speakingActive,
    speakingState,
    audioUrl,
    audioBlob,
    recordingStream,
    seconds,
    startRecording,
    stopRecording,
    stopSpeaking,
    reRecord,
  } = useSpeakingRecorder(requireAuth, { timer: true });
  const { uploadAndSave, uploading, attempts } = useShadowing(id);
  const [shadowingSaved, setShadowingSaved] = useState(false);
  const [shadowingSatisfied, setShadowingSatisfied] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  // D13: deep link from /favorites with ?note=1 opens the note drawer
  // immediately so the user lands on their saved note.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("note") === "1") setNoteOpen(true);
  }, [searchParams]);

  // Auto-upload recording when entering reviewing state
  useEffect(() => {
    if (speakingState === "reviewing" && audioBlob && !shadowingSaved) {
      setShadowingSaved(true); // prevent double-upload
      uploadAndSave(audioBlob, {
        videoId: id,
        subtitleId: video?.subtitles?.[currentSubtitleIndex]?.id ?? null,
        // D10: 上报录音时长，后端按秒累计进 LearningEvent。
        durationMs: seconds > 0 ? seconds * 1000 : null,
        isSatisfied: false,
      });
    }
  }, [speakingState, audioBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  // 时间同步回调通过 ref 读取最新 video / setter（避免与 useVideoPlayer 返回值的前向引用）。
  const videoForTickRef = useRef<VideoWithSubtitles | null>(null);
  const setSubtitleIndexRef = useRef<(idx: number) => void>(() => {});
  // D10 逐句跟读：句尾检测回调（钩子在 useVideoPlayer 之后创建，经 ref 接入）。
  const sentenceHandleTimeRef = useRef<(t: number) => void>(() => {});

  // Playback-time tick shared by both backends (HTML5 timeupdate / YouTube
  // poll): keeps the current-subtitle highlight and watch-time tracking in sync.
  const handleTimeTick = useCallback(
    (t: number) => {
      const v = videoForTickRef.current;
      if (!v) return;
      const idx = findSubtitleIndex(v.subtitles, t);
      if (idx !== -1) setSubtitleIndexRef.current(idx);
      trackWatchTime(id, t);
      sentenceHandleTimeRef.current(t);
    },
    [id]
  );

  const {
    video,
    playbackMode,
    locked,
    currentSubtitleIndex,
    setCurrentSubtitleIndex,
    videoRef,
    ytContainerRef,
    isYtMode,
    play,
    seekTo,
    retry,
    rate,
    setRate,
    muted,
    toggleMute,
    setVolume,
    cycleSubtitleMode,
    fullscreenElRef,
    toggleFullscreen,
  } = useVideoPlayer({
    videoId: id,
    onTimeTick: handleTimeTick,
  });

  // D0 解锁制：Free 未解锁时播放器区域渲染解锁面板；
  // 解锁成功后重拉详情（字幕/媒体 URL 恢复）直接进入播放。
  const [unlocking, setUnlocking] = useState(false);
  const handleUnlock = useCallback(async () => {
    if (unlocking) return;
    setUnlocking(true);
    try {
      await api(`/api/v1/videos/${id}/unlock`, { method: "POST" });
      retry();
    } catch (err) {
      toast.error(apiErrorMessage(err, "解锁失败，请重试"));
    } finally {
      setUnlocking(false);
    }
  }, [id, retry, unlocking]);

  // Keep the tick callback's video reference in sync.
  useEffect(() => {
    videoForTickRef.current = video;
    setSubtitleIndexRef.current = setCurrentSubtitleIndex;
  }, [video, setCurrentSubtitleIndex]);

  // D10 逐句跟读：状态机（仅 HTML5 本地播放可用）。与手动跟读共用
  // useSpeakingRecorder，退出模式即回到手动流程。
  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const handleSentenceAdvance = useCallback(() => {
    setShadowingSaved(false);
    setShadowingSatisfied(false);
  }, []);

  const sentenceShadow = useSentenceShadowing({
    subtitles: video?.subtitles,
    currentIndex: currentSubtitleIndex,
    setCurrentIndex: setCurrentSubtitleIndex,
    seekTo,
    play,
    pause: pauseVideo,
    speakingState,
    startRecording,
    stopSpeaking,
    reRecord,
    onAdvance: handleSentenceAdvance,
  });

  // 句尾检测从播放 tick 接入状态机（handleTime 内部经 ref 自稳）。
  useEffect(() => {
    sentenceHandleTimeRef.current = sentenceShadow.handleTime;
  }, [sentenceShadow.handleTime]);

  // D10 跟读时间线：进度条绿点（点击定位到对应句并回放该句录音）。
  const replayAttempt = useCallback(
    (a: ShadowingAttempt) => {
      const subs = video?.subtitles;
      if (typeof a.subtitle_start_time === "number" && subs) {
        const idx = findSubtitleIndex(subs, a.subtitle_start_time);
        if (idx !== -1) setCurrentSubtitleIndex(idx);
        seekTo(a.subtitle_start_time);
      }
      const audio = new Audio(mediaUrl(a.audio_url, { withToken: true }));
      audio.play().catch(() => {});
    },
    [video, seekTo, setCurrentSubtitleIndex]
  );

  const shadowMarkers = useMemo(() => {
    if (!video?.duration) return [];
    return attempts
      .filter((a) => typeof a.subtitle_start_time === "number")
      .map((a) => ({
        position: a.subtitle_start_time as number,
        onClick: () => replayAttempt(a),
      }));
  }, [attempts, video, replayAttempt]);

  // D10 波形对比：原声取视频文件尽力解码切片；稳定对象标识避免重复拉取。
  const originalSourceUrl = useMemo(() => {
    if (isYtMode || !video) return null;
    const url = bestVideoUrl(video);
    return url ? mediaUrl(url, { withToken: true }) : null;
  }, [video, isYtMode]);

  const originalClip = useMemo(() => {
    const sub = video?.subtitles?.[currentSubtitleIndex];
    return sub ? { start: sub.start_time, end: sub.end_time } : null;
  }, [video, currentSubtitleIndex]);

  // D3b: seek to ?t=<seconds> once the video is ready. Triggered when
  // the user drills an answer wrong and clicks "回看原句" → /watch/{id}?t=...
  useEffect(() => {
    if (playbackMode !== "ready" || !video || !videoRef.current) return;
    const t = searchParams.get("t");
    if (!t) return;
    const seconds = parseFloat(t);
    if (!Number.isNaN(seconds) && seconds >= 0) {
      videoRef.current.currentTime = seconds;
    }
    // videoRef is a stable ref; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackMode, video, searchParams]);

  // D2: first-time coach mark tour. Only shows when the watch page is
  // fully ready (subtitles loaded, video URL known) so the spotlight
  // rects aren't zero. The hook writes seeword_coach_done on finish/skip.
  const coach = useCoachMark({
    isAuthenticated,
    isReady: playbackMode === "ready" && !!video && (video.subtitles?.length ?? 0) > 0,
  });

  // D3b: EndScreen state. Activated when the <video> fires onEnded.
  const [ended, setEnded] = useState(false);
  const [videoVocabCount, setVideoVocabCount] = useState(0);
  const [shadowingSentences, setShadowingSentences] = useState<ShadowingSentence[]>([]);
  // Session-scoped stats. Lookups/adds are tracked by useWordLookup;
  // watch time is approximated from videoRef.currentTime on ended.
  const sessionLookupsRef = useRef(0);
  const sessionAddsRef = useRef(0);

  // 字幕自动居中：只滚动右侧内层字幕列表，绝不触碰整页 <main>。
  // 用 scrollIntoView 会连带 <main> 一起拽回顶部，导致停在底部练习区时页面被拽走白屏。
  const subtitleListRef = useRef<HTMLDivElement>(null);
  // Mobile sticky mini-player: pin the video to the bottom-right when it
  // scrolls out of view. Desktop keeps its in-flow sticky layout.
  const slotRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { isPip, dismiss } = useStickyPip(slotRef, isMobile && playbackMode === "ready");
  useEffect(() => {
    const container = subtitleListRef.current;
    const el = document.getElementById(`subtitle-${currentSubtitleIndex}`);
    if (!container || !el) return;
    const elTop = el.getBoundingClientRect().top;
    const cTop = container.getBoundingClientRect().top;
    const offset = elTop - cTop - (container.clientHeight / 2 - el.clientHeight / 2);
    // 仅当目标句偏离容器中心超过半句高时才滚，避免每次 timeUpdate 都抖动
    if (Math.abs(offset) > el.clientHeight / 2) {
      container.scrollBy({ top: offset, behavior: "smooth" });
    }
  }, [currentSubtitleIndex]);

  const {
    isFavorited,
    isLiked,
    likeCount,
    noteDraft,
    setNoteDraft,
    toggleFavorite,
    toggleLike,
    saveNote,
    clearNote,
  } = useVideoMeta(id, video?.like_count ?? 0);
  const { selectedWord, wordGloss, handleWordClick, saveToVocabulary, speakWord, clearWord } =
    useWordLookup({
      requireAuth,
      getSubtitles: () => video?.subtitles,
      videoId: id,
    });

  const subtitleMode = useWatchStore((s) => s.subtitleMode);
  const panelCollapsed = useWatchStore((s) => s.panelCollapsed);
  const setPanelCollapsed = useWatchStore((s) => s.setPanelCollapsed);
  const selectedExamLevel = useWatchStore((s) => s.selectedExamLevel);
  const setSelectedExamLevel = useWatchStore((s) => s.setSelectedExamLevel);

  // D1：字幕字号（小/中/大）持久化到用户偏好。
  const [subtitleFontSize, setSubtitleFontSize] = useState<SubtitleFontSize>("medium");

  // Load the user's target exam level + subtitle font size from preferences on mount.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const prefs = await api<{
          target_exam: string | null;
          subtitle_font_size?: string | null;
        }>("/api/v1/users/me/preferences");
        if (cancelled) return;
        setSelectedExamLevel(prefs.target_exam ?? "cet4");
        if (
          prefs.subtitle_font_size === "small" ||
          prefs.subtitle_font_size === "medium" ||
          prefs.subtitle_font_size === "large"
        ) {
          setSubtitleFontSize(prefs.subtitle_font_size);
        }
      } catch {
        if (!cancelled) setSelectedExamLevel("cet4");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setSelectedExamLevel]);

  // Sprint 3: Load the user's actively-learning vocabulary for subtitle highlight.
  const [vocabWords, setVocabWords] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ words: string[] }>(
          "/api/v1/vocabulary/words?mastery=learning,reviewing"
        );
        if (!cancelled) setVocabWords(new Set(res.words));
      } catch {
        // non-fatal: vocab highlight simply won't show
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Persist a target-level change back to preferences (best-effort).
  async function handleExamLevelChange(lv: string) {
    setSelectedExamLevel(lv);
    try {
      await api("/api/v1/users/me/preferences", {
        method: "PUT",
        body: JSON.stringify({ target_exam: lv }),
      });
    } catch {
      // non-fatal: selection still applies for this session
      toast.error("偏好保存失败，本次会话仍生效");
    }
  }

  // D1：字幕字号变更 —— 立即生效 + 写入偏好（尽力而为）。
  async function handleFontSizeChange(size: SubtitleFontSize) {
    setSubtitleFontSize(size);
    try {
      await api("/api/v1/users/me/preferences", {
        method: "PUT",
        body: JSON.stringify({ subtitle_font_size: size }),
      });
    } catch {
      // non-fatal: 本次会话仍生效
    }
  }

  function handleNextSubtitle() {
    if (!video?.subtitles) return;
    if (currentSubtitleIndex < video.subtitles.length - 1) {
      const next = video.subtitles[currentSubtitleIndex + 1];
      if (!next) return;
      // Reset speaking state before advancing — otherwise the user is stuck
      // in the result view of the old sentence.
      if (speakingActive) reRecord();
      setShadowingSaved(false);
      setShadowingSatisfied(false);
      setCurrentSubtitleIndex(currentSubtitleIndex + 1);
      seekTo(next.start_time);
    }
  }

  /** Play the original audio by seeking the video to the current subtitle. */
  function playOriginal() {
    const sub = video?.subtitles?.[currentSubtitleIndex];
    if (!sub) return;
    seekTo(sub.start_time);
    play();
  }

  // Exam-level word highlight: returns tailwind class if the word should be
  // highlighted for the user's selected target level, else "".
  function levelClassFor(word: string, wordLevels: Record<string, string[]> | null): string {
    const token = cleanToken(word);
    // Sprint 3: vocab recurrence highlight takes priority over exam-level highlight.
    if (vocabWords.has(token)) {
      return "bg-brand-100 text-brand-700 underline decoration-brand-400 decoration-2 underline-offset-2 rounded px-0.5";
    }
    if (!wordLevels || !selectedExamLevel) return "";
    const levels = wordLevels[token];
    if (!levels || !shouldDisplay(levels, selectedExamLevel)) return "";
    return wordHighlightClass(levels);
  }

  function isSelectedWord(word: string): boolean {
    if (!selectedWord) return false;
    return selectedWord === cleanToken(word);
  }

  // --- Keyboard shortcuts: 页面层不再持有快捷键 —— D1 后统一由
  // useVideoPlayer 处理（空格/←→/↑↓音量/M/F/C/S）；「下一句」由录音展开态按钮承担。

  // --- Loading / Error states ---
  if (!video && playbackMode !== "error") return <FullPageSpinner />;

  if (playbackMode === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto text-muted mb-4" />
          <p className="text-ink">加载视频失败</p>
          <p className="mt-1 text-sm text-muted">请检查网络连接后重试</p>
          <Button onClick={retry} className="mt-4">
            重新加载
          </Button>
        </div>
      </main>
    );
  }

  if (!video) return <FullPageSpinner />;

  if (playbackMode === "processing") {
    const stepLabel = video.processing_step
      ? (STEP_LABELS[video.processing_step] ?? "处理中...")
      : "处理中...";
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto animate-spin text-brand-500" />
          <p className="mt-4 text-ink">{stepLabel}</p>
          <p className="mt-1 text-sm text-muted">视频下载和转码需要几分钟，请稍候</p>
          {video.status === "ready_subtitles" && (
            <p className="mt-2 text-xs text-success">字幕已就绪，视频处理中...</p>
          )}
        </div>
      </main>
    );
  }

  if (video.status === "error")
    return (
      <ErrorState
        title="处理失败"
        message={video.error_message || "未知错误"}
        action={
          <button
            onClick={() => router.push("/browse")}
            className="mt-4 text-sm text-brand-500 hover:underline"
          >
            返回浏览
          </button>
        }
        fullPage
      />
    );

  // D0 解锁制：未解锁视频只展示元数据 + 解锁面板（字幕/媒体已被后端闸住）。
  if (locked) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 sm:px-7 pt-6 pb-16">
        <div className="mb-4 flex items-center gap-3">
          <button
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink transition-colors cursor-pointer shrink-0"
            onClick={() => router.push("/browse")}
          >
            <ArrowLeft size={14} />
            返回浏览
          </button>
          <div className="h-4 w-px bg-hairline shrink-0" />
          <h1 className="text-[15px] font-semibold text-ink truncate flex-1 min-w-0">
            {video.title}
          </h1>
        </div>
        <div className="relative w-full max-w-3xl aspect-video bg-surface-dark rounded-xl overflow-hidden shadow-lift">
          <UnlockPanel
            title={video.title}
            difficultyLevel={video.difficulty_level}
            duration={video.duration}
            remaining={video.access?.remaining_this_month ?? 0}
            quota={video.access?.quota ?? 3}
            onUnlock={handleUnlock}
            unlocking={unlocking}
          />
        </div>
      </div>
    );
  }

  const currentSubtitle = video.subtitles[currentSubtitleIndex];

  return (
    // 自然流布局：顶部 header + 双列（视频/字幕）+ 下方练习区，整页自然滚动。
    // max-w-[1280px] 居中容器（对齐原型 05-watch.html）：在 125%/150% 缩放倍率下
    // 保持视频与字幕面板的最佳比例，避免宽屏下视频列过度拉伸。
    <div className="mx-auto max-w-[1280px] px-4 sm:px-7 pt-6 pb-16">
      {/* ===== Header ===== */}
      <div className="mb-4">
        {/* 顶部细行：返回 + 标题 + 操作图标 */}
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink transition-colors cursor-pointer shrink-0"
            onClick={() => router.push("/browse")}
          >
            <ArrowLeft size={14} />
            返回浏览
          </button>
          <div className="h-4 w-px bg-hairline shrink-0" />
          <h1 className="text-[15px] font-semibold text-ink truncate flex-1 min-w-0">
            {video.title}
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            <button
              className="h-9 px-2 rounded-lg flex items-center gap-1 text-muted hover:bg-surface-card hover:text-ink transition-colors cursor-pointer"
              onClick={toggleLike}
              aria-label={isLiked ? `取消点赞（${likeCount}）` : `点赞（${likeCount}）`}
              title={isLiked ? "取消点赞" : "点赞"}
            >
              <Heart size={18} className={cn(isLiked && "fill-current text-error")} />
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  isLiked ? "text-error" : "text-muted"
                )}
              >
                {likeCount > 0 ? likeCount : "点赞"}
              </span>
            </button>
            <button
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-card hover:text-ink transition-colors cursor-pointer"
              onClick={toggleFavorite}
              aria-label={isFavorited ? "取消收藏" : "收藏视频"}
              title={isFavorited ? "取消收藏" : "收藏"}
            >
              <Bookmark size={18} className={cn(isFavorited && "fill-current text-brand-500")} />
            </button>
            <button
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-card hover:text-ink transition-colors cursor-pointer"
              onClick={() => router.push("/vocabulary")}
              aria-label="词汇本"
              title="词汇本"
            >
              <BookOpen size={18} />
            </button>
            <button
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer",
                noteOpen
                  ? "bg-brand-50 text-brand-500"
                  : "text-muted hover:bg-surface-card hover:text-ink"
              )}
              onClick={() => setNoteOpen((v) => !v)}
              aria-label="笔记"
              title="笔记"
            >
              <Pencil size={18} />
            </button>
          </div>
        </div>

        {/* meta 细行 */}
        <div className="flex items-center gap-2 text-[12px] text-muted mt-2">
          <span className="font-semibold text-ink">SeeWord</span>
          <span>·</span>
          <span>{video.difficulty_level || "B2"}</span>
          <span>·</span>
          <span>{formatDuration(video.duration)}</span>
        </div>

        {/* 笔记抽屉 */}
        {noteOpen && (
          <div className="bg-canvas border border-hairline rounded-lg p-4 mt-3 animate-fade-in">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-sm font-semibold">学习笔记</span>
              <button
                onClick={() => setNoteOpen(false)}
                className="text-muted hover:text-ink"
                aria-label="关闭笔记"
              >
                <X size={16} />
              </button>
            </div>
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="记录重点句型、生词或心得..."
              rows={3}
              className="resize-none mb-3"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={clearNote}>
                清空
              </Button>
              <Button size="sm" onClick={saveNote}>
                保存
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ===== 双列：左视频+字幕+录音，右字幕面板（可折叠） ===== */}
      <div
        className={cn(
          "grid grid-cols-1 gap-5 items-start transition-[grid-template-columns] duration-200",
          panelCollapsed ? "lg:grid-cols-[1fr_56px]" : "lg:grid-cols-[2fr_1fr]"
        )}
      >
        {/* ========== LEFT COLUMN ========== */}
        <div className="min-w-0">
          {/* Video player —— 宽高比驱动（不依赖父级高度链，避免塌缩黑屏）。
              移动端滚出视口时，内层 wrapper 浮为右下角 mini-player（PiP），
              <video> 节点不换父，播放连续。 */}
          <div
            ref={slotRef}
            className="relative w-full aspect-video bg-surface-dark rounded-xl overflow-hidden shadow-lift"
          >
            <div
              ref={(el) => {
                // D1：F 全屏的目标容器（播放器外壳）。
                fullscreenElRef.current = el;
              }}
              className={cn(
                "transition-all duration-300",
                isPip
                  ? "fixed bottom-4 right-4 z-50 w-[160px] max-w-[40vw] aspect-video rounded-lg shadow-2xl"
                  : "absolute inset-0"
              )}
            >
              {playbackMode === "ready" && bestVideoUrl(video) ? (
                <>
                  <video
                    ref={videoRef}
                    src={mediaUrl(bestVideoUrl(video)!, {
                      // D0 媒体门控：/media 需要可识别的观看者（Pro/已解锁），
                      // <video> 无法带 Authorization 头，统一用 ?token= 携带。
                      withToken: true,
                    })}
                    className="h-full w-full object-contain"
                    onTimeUpdate={(e) =>
                      // 统一走 handleTimeTick（字幕同步 + 观看时长 + D10 句尾检测）；
                      // 此前内联实现漏接逐句跟读句尾回调，自动录音永不触发。
                      handleTimeTick(e.currentTarget.currentTime)
                    }
                    onPlay={() =>
                      track("play", { position_s: videoRef.current?.currentTime ?? 0 }, id)
                    }
                    onPause={() =>
                      track("pause", { position_s: videoRef.current?.currentTime ?? 0 }, id)
                    }
                    onSeeked={() =>
                      track("seek", { position_s: videoRef.current?.currentTime ?? 0 }, id)
                    }
                    onEnded={() => {
                      track("complete", { position_s: videoRef.current?.currentTime ?? 0 }, id);
                      // D3b: trigger the EndScreen. Fetch this video's vocab
                      // count + top-3 shadowing sentences in parallel; both
                      // are best-effort — failures are silent.
                      setEnded(true);
                      const vid = video?.id;
                      if (!vid) return;
                      Promise.all([
                        api<{ total?: number }>(
                          `/api/v1/videos/${vid}/vocabulary?page=1&page_size=1`
                        )
                          .then((d) => setVideoVocabCount(d.total ?? 0))
                          .catch(() => {}),
                        api<ShadowingSentence[]>(
                          `/api/v1/videos/${vid}/shadowing-sentences?limit=3`
                        )
                          .then(setShadowingSentences)
                          .catch(() => {}),
                      ]);
                    }}
                  />
                  {/* D1 自定义控制条（PiP 小窗不渲染，避免小窗内控件拥挤） */}
                  {!isPip && (
                    <VideoControls
                      videoRef={videoRef}
                      duration={video.duration}
                      rate={rate}
                      setRate={setRate}
                      muted={muted}
                      toggleMute={toggleMute}
                      setVolume={setVolume}
                      subtitleMode={subtitleMode}
                      onCycleSubtitleMode={cycleSubtitleMode}
                      subtitleFontSize={subtitleFontSize}
                      onFontSizeChange={handleFontSizeChange}
                      toggleFullscreen={toggleFullscreen}
                      isMobile={isMobile}
                      markers={shadowMarkers}
                    />
                  )}
                  {isPip && (
                    <button
                      type="button"
                      onClick={dismiss}
                      className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface-dark text-on-dark shadow hover:bg-surface-dark/80"
                      aria-label="关闭小窗播放"
                    >
                      <X size={14} />
                    </button>
                  )}
                  {/* D3b EndScreen — only when the <video> has fired onEnded. */}
                  {ended && !isPip && video?.id && (
                    <EndScreen
                      stats={{
                        watchSeconds: Math.round(videoRef.current?.currentTime ?? 0),
                        wordsLookedUp: sessionLookupsRef.current,
                        wordsAdded: sessionAddsRef.current,
                      }}
                      videoVocabCount={videoVocabCount}
                      shadowingSentences={shadowingSentences}
                      onReplay={() => {
                        setEnded(false);
                        videoRef.current?.play().catch(() => {});
                      }}
                      onReviewVocab={() => router.push(`/vocabulary/drill?video_id=${video.id}`)}
                      onShadowing={() => {
                        // Jump back to the first shadowing sentence and resume
                        // playback so the user can immediately start shadowing.
                        if (shadowingSentences[0]) {
                          if (videoRef.current && shadowingSentences[0]) {
                            videoRef.current.currentTime = shadowingSentences[0].start_time;
                          }
                          setEnded(false);
                          videoRef.current?.play().catch(() => {});
                        }
                      }}
                      onGoHome={() => router.push("/")}
                    />
                  )}
                </>
              ) : playbackMode === "ready" && isYtMode && youtubeId(video) ? (
                <>
                  <div ref={ytContainerRef} className="h-full w-full" />
                  {isPip && (
                    <button
                      type="button"
                      onClick={dismiss}
                      className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface-dark text-on-dark shadow hover:bg-surface-dark/80"
                      aria-label="关闭小窗播放"
                    >
                      <X size={14} />
                    </button>
                  )}
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="text-center">
                    <Play size={40} className="mx-auto text-white/30" />
                    <p className="mt-3 text-sm text-white/40">视频未就绪</p>
                  </div>
                </div>
              )}
            </div>
            {/* 考试目标层级选择器：右上角收起药丸，不干扰观看（mini-player 时隐藏） */}
            {!isPip && (
              <ExamLevelSelector level={selectedExamLevel} onChange={handleExamLevelChange} />
            )}
          </div>

          {/* 字幕卡：紧贴视频正下方，录音按钮行内（次要操作，按需展开） */}
          {currentSubtitle && (
            <div className="mt-3 bg-canvas border border-hairline rounded-xl p-5">
              {/* 字幕进度指示 */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[11px] font-mono text-muted-soft"
                  data-testid="subtitle-counter"
                >
                  {currentSubtitleIndex + 1} / {video.subtitles.length}
                </span>
                <div className="flex-1 mx-3 h-0.5 rounded-full bg-surface-card">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-300"
                    style={{
                      width: `${((currentSubtitleIndex + 1) / video.subtitles.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  {subtitleMode !== "chinese" && subtitleMode !== "hidden" && (
                    <div
                      className="now-sub-en text-left leading-[1.7]"
                      style={{ fontSize: SUBTITLE_FONT_EN[subtitleFontSize] }}
                    >
                      {currentSubtitle.text_en.split(" ").map((word, i) => (
                        <span
                          key={i}
                          className={cn(
                            "now-sub-word",
                            levelClassFor(word, currentSubtitle.word_levels),
                            isSelectedWord(word) && "now-sub-word-hl"
                          )}
                          onClick={() => handleWordClick(word)}
                        >
                          {word}{" "}
                        </span>
                      ))}
                    </div>
                  )}
                  {subtitleMode === "hidden" && (
                    <p className="text-[12px] text-muted-soft">字幕已隐藏 —— 按 S 键切换显示</p>
                  )}
                  {(subtitleMode === "bilingual" || subtitleMode === "chinese") &&
                    currentSubtitle.text_zh && (
                      <div
                        className="now-sub-zh"
                        style={{ fontSize: SUBTITLE_FONT_ZH[subtitleFontSize] }}
                      >
                        {currentSubtitle.text_zh}
                      </div>
                    )}
                </div>

                {/* D10 逐句跟读模式开关（YouTube 源不可控时序，置灰） */}
                <button
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors",
                    sentenceShadow.active
                      ? "bg-success text-white shadow-brand cursor-pointer"
                      : "text-muted bg-surface-soft hover:bg-hairline cursor-pointer",
                    isYtMode && "opacity-50 cursor-not-allowed hover:bg-surface-soft"
                  )}
                  onClick={() => {
                    if (isYtMode) return;
                    if (sentenceShadow.active) sentenceShadow.exit();
                    else sentenceShadow.start();
                  }}
                  disabled={isYtMode}
                  title={isYtMode ? "YouTube 视频暂不支持逐句跟读" : "播一句自动录音，逐句循环"}
                  aria-label={sentenceShadow.active ? "退出逐句跟读" : "开始逐句跟读"}
                >
                  <Repeat size={15} />
                  {sentenceShadow.active ? "退出逐句" : "逐句跟读"}
                </button>

                {/* 录音：默认只一个小按钮，点击才展开录音 UI */}
                <button
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer",
                    speakingActive
                      ? "bg-brand-500 text-white shadow-brand"
                      : "text-brand-500 bg-brand-50 hover:bg-brand-100"
                  )}
                  onClick={() => {
                    if (speakingActive) stopSpeaking();
                    else startRecording();
                  }}
                >
                  <Mic size={15} />
                  录音
                </button>
              </div>

              {/* D10 逐句模式状态行（播放中/录音中/回放引导） */}
              {sentenceShadow.active && (
                <div className="mt-3 flex items-center gap-2 bg-brand-50 rounded-lg px-3 py-2 text-[12px] text-brand-600">
                  <Repeat size={13} className="shrink-0" />
                  <span className="font-medium">
                    {sentenceShadow.phase === "playing"
                      ? "正在播放本句，播完自动开始录音"
                      : sentenceShadow.phase === "recording"
                        ? "正在录音，读完后点击上方停止"
                        : "录音完成，回放后点「下一句」继续"}
                  </span>
                </div>
              )}

              {/* 录音展开态：录音 / 回放 / 下一句 */}
              {speakingActive && (
                <div className="mt-4 pt-4 border-t border-hairline">
                  {speakingState === "idle" && (
                    <div className="flex items-center gap-3 bg-surface-soft rounded-lg p-3">
                      <button
                        className="w-11 h-11 rounded-full bg-brand-500 text-white flex items-center justify-center shadow-brand cursor-pointer"
                        onClick={startRecording}
                        aria-label="开始录音"
                      >
                        <Mic size={20} />
                      </button>
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-ink">点击麦克风开始录音</p>
                        <p className="text-xs text-muted mt-0.5">朗读上方高亮字幕</p>
                      </div>
                    </div>
                  )}

                  {speakingState === "listening" && (
                    <div className="flex items-center gap-3 bg-surface-soft rounded-lg p-3">
                      <button
                        className="w-11 h-11 rounded-full bg-error text-on-primary flex items-center justify-center shadow-brand animate-pulse cursor-pointer"
                        onClick={stopRecording}
                        aria-label="停止录音"
                      >
                        <Mic size={20} />
                      </button>
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-ink">录音中…</p>
                        <div className="mt-1">
                          <AudioWaveform stream={recordingStream} barCount={24} />
                        </div>
                      </div>
                      <button
                        className="text-[13px] font-semibold text-muted hover:text-ink cursor-pointer"
                        onClick={stopSpeaking}
                      >
                        取消
                      </button>
                    </div>
                  )}

                  {speakingState === "reviewing" && (
                    <div className="bg-surface-soft rounded-lg p-3 space-y-3">
                      {/* Status row */}
                      <div className="flex items-center gap-2 text-[13px]">
                        {uploading ? (
                          <>
                            <Loader2 size={14} className="animate-spin text-brand-500" />
                            <span className="text-muted">正在保存跟读录音…</span>
                          </>
                        ) : shadowingSaved ? (
                          <>
                            <Check size={14} className="text-success" />
                            <span className="text-success font-medium">已保存</span>
                          </>
                        ) : (
                          <span className="text-muted">录音完成，回放听自己的发音</span>
                        )}
                      </div>

                      {/* D10 波形对比（原声/录音），自带播放按钮 */}
                      <WaveformCompare
                        recordingBlob={audioBlob}
                        recordingUrl={audioUrl}
                        originalUrl={originalSourceUrl}
                        originalClip={originalClip}
                        onPlayOriginal={playOriginal}
                      />

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={reRecord}>
                          重录
                        </Button>
                        <Button
                          variant={shadowingSatisfied ? "primary" : "outline"}
                          size="sm"
                          onClick={() => setShadowingSatisfied((v) => !v)}
                          className={
                            shadowingSatisfied ? "bg-success hover:bg-success/90 shadow-none" : ""
                          }
                        >
                          <Check size={13} className="mr-1" />
                          满意
                        </Button>
                        <Button
                          size="sm"
                          onClick={sentenceShadow.active ? sentenceShadow.next : handleNextSubtitle}
                        >
                          下一句
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Shadowing history: recent attempts for this video */}
              <div data-coach="practice">
                <ShadowingHistory attempts={attempts.slice(0, 5)} />
              </div>
            </div>
          )}

          {/* 来源声明（ICP 合规）：原视频来源 + 版权声明 */}
          {video.source_url && (
            <div className="mt-4">
              <div className="flex items-center gap-2.5 bg-canvas border border-hairline rounded-lg px-3.5 py-2.5">
                <span className="w-5 h-5 rounded-[5px] bg-[#ff0000] flex items-center justify-center shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span className="text-[13px] text-muted">
                  原视频来源：YouTube ·{" "}
                  <a
                    href={video.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 font-medium hover:underline"
                  >
                    {video.source_url.replace(/^https?:\/\//, "")}
                  </a>
                </span>
              </div>
              <p className="text-[11px] text-muted-soft leading-relaxed mt-2">
                本视频内容转载自 YouTube
                平台，仅供学习交流使用，版权归原作者所有。如有侵权请联系我们删除。
              </p>
            </div>
          )}
        </div>

        {/* ========== RIGHT COLUMN：字幕面板，可折叠为图标栏 ========== */}
        <aside className="bg-canvas border border-hairline rounded-xl lg:sticky lg:top-4 overflow-hidden min-w-0">
          {panelCollapsed ? (
            // 收起态：只显示垂直图标栏，hover 看标签，点击展开切到该模式
            <SubtitleModeRail onExpand={() => setPanelCollapsed(false)} />
          ) : (
            <>
              {/* 头部：模式切换 + 折叠按钮 常驻同一行，切换模式不跳位 */}
              <div className="border-b border-hairline">
                <SubtitleModeTabs
                  collapsed={false}
                  onToggleCollapse={() => setPanelCollapsed(true)}
                />
              </div>

              {/* 字幕列表 —— 隐藏模式时提示，其余按模式渲染 */}
              {subtitleMode === "hidden" ? (
                <div className="p-8 text-center text-xs text-muted">
                  字幕已隐藏，按 S 键或控制条切换显示模式
                </div>
              ) : (
                <div
                  ref={subtitleListRef}
                  data-coach="subtitles"
                  className="max-h-[560px] overflow-y-auto subtitle-scroll p-1.5"
                >
                  <div className="flex flex-col gap-0.5">
                    {video.subtitles.map((sub, i) => (
                      <button
                        key={sub.id}
                        id={`subtitle-${i}`}
                        onClick={() => {
                          setCurrentSubtitleIndex(i);
                          seekTo(sub.start_time);
                        }}
                        className={cn(
                          "w-full text-left rounded-lg border-l-[3px] border-transparent cursor-pointer transition-colors duration-100 hover:bg-surface-soft p-3",
                          i === currentSubtitleIndex && "bg-brand-50 border-l-brand-500"
                        )}
                      >
                        {subtitleMode !== "chinese" && (
                          <div
                            className={cn(
                              "font-medium text-sm leading-relaxed",
                              i === currentSubtitleIndex ? "text-brand-500" : "text-ink"
                            )}
                          >
                            {sub.text_en.split(" ").map((word, wi) => (
                              <span key={wi} className={levelClassFor(word, sub.word_levels)}>
                                {word}{" "}
                              </span>
                            ))}
                          </div>
                        )}
                        {(subtitleMode === "bilingual" || subtitleMode === "chinese") &&
                          sub.text_zh && (
                            <div className="text-muted mt-0.5 text-xs">{sub.text_zh}</div>
                          )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {/* ===== 练习区占位：视频试卷已砍，引导到真题练习 ===== */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3.5 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold tracking-tight text-ink">本视频练习试卷</h2>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-pill bg-brand-50 text-brand-600">
              暂停开发
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 p-5 bg-canvas border border-dashed border-hairline-strong rounded-xl">
          <span className="w-9 h-9 rounded-lg bg-surface-soft flex items-center justify-center text-brand-500 flex-shrink-0">
            <Layers size={16} />
          </span>
          <p className="text-[13px] text-muted leading-relaxed">
            本视频暂不出试卷，真题阅读练习已上线——去
            <Link href="/practice/exams" className="text-brand-600 font-semibold hover:underline">
              真题练习
            </Link>
            刷最新卷。
          </p>
        </div>
      </section>

      {/* Word tooltip overlay（可拖动，默认右下角不遮挡当前字幕句） */}
      {selectedWord && (
        <div data-coach="word-card">
          <WordTooltipInline
            word={selectedWord}
            gloss={wordGloss}
            onClose={clearWord}
            onPronounce={() => speakWord(selectedWord)}
            onSave={saveToVocabulary}
          />
        </div>
      )}

      {/* D2 CoachMark — only renders when active (gated by localStorage flag). */}
      {coach.active && (
        <CoachMark
          steps={coach.steps}
          stepIndex={coach.stepIndex}
          onNext={coach.next}
          onSkip={coach.skip}
          onFinish={coach.finish}
        />
      )}
    </div>
  );
}
