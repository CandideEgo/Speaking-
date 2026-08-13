"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useWatchStore } from "@/stores/watchStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSpeakingRecorder } from "@/hooks/useSpeakingRecorder";
import { useShadowing } from "@/hooks/useShadowing";
import { useStickyPip } from "@/hooks/useStickyPip";
import { useVideoPlayer, bestVideoUrl, youtubeId } from "@/hooks/useVideoPlayer";
import { useWordLookup } from "@/hooks/useWordLookup";
import { useVideoMeta } from "@/hooks/useVideoMeta";
import { api, mediaUrl } from "@/lib/api";
import { track, trackWatchTime } from "@/lib/analytics";
import { findSubtitleIndex } from "@/lib/subtitles";
import type { VideoWithSubtitles } from "@/types";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import SubtitleModeTabs, { SubtitleModeRail } from "@/components/subtitle/SubtitleModeTabs";
import { WordTooltipInline } from "@/components/subtitle/WordTooltipInline";
import { ForkBadge } from "@/components/video/ForkBadge";
import { ExamLevelSelector } from "@/components/watch/ExamLevelSelector";
import { AudioWaveform } from "@/components/speaking/AudioWaveform";
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
  Volume2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import { STEP_LABELS } from "@/lib/videoStatus";

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
    startRecording,
    stopRecording,
    stopSpeaking,
    reRecord,
  } = useSpeakingRecorder(requireAuth);
  const { uploadAndSave, uploading, attempts } = useShadowing(id);
  const [shadowingSaved, setShadowingSaved] = useState(false);
  const [shadowingSatisfied, setShadowingSatisfied] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  // Auto-upload recording when entering reviewing state
  useEffect(() => {
    if (speakingState === "reviewing" && audioBlob && !shadowingSaved) {
      setShadowingSaved(true); // prevent double-upload
      uploadAndSave(audioBlob, {
        videoId: id,
        subtitleId: video?.subtitles?.[currentSubtitleIndex]?.id ?? null,
        isSatisfied: false,
      });
    }
  }, [speakingState, audioBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  // 时间同步回调通过 ref 读取最新 video / setter（避免与 useVideoPlayer 返回值的前向引用）。
  const videoForTickRef = useRef<VideoWithSubtitles | null>(null);
  const setSubtitleIndexRef = useRef<(idx: number) => void>(() => {});

  // Playback-time tick shared by both backends (HTML5 timeupdate / YouTube
  // poll): keeps the current-subtitle highlight and watch-time tracking in sync.
  const handleTimeTick = useCallback(
    (t: number) => {
      const v = videoForTickRef.current;
      if (!v) return;
      const idx = findSubtitleIndex(v.subtitles, t);
      if (idx !== -1) setSubtitleIndexRef.current(idx);
      trackWatchTime(id, t);
    },
    [id]
  );

  const {
    video,
    playbackMode,
    currentSubtitleIndex,
    setCurrentSubtitleIndex,
    videoRef,
    ytContainerRef,
    isYtMode,
    play,
    seekTo,
    retry,
  } = useVideoPlayer({
    videoId: id,
    onTimeTick: handleTimeTick,
  });

  // Keep the tick callback's video reference in sync.
  useEffect(() => {
    videoForTickRef.current = video;
    setSubtitleIndexRef.current = setCurrentSubtitleIndex;
  }, [video, setCurrentSubtitleIndex]);

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
    noteDraft,
    setNoteDraft,
    toggleFavorite,
    toggleLike,
    saveNote,
    clearNote,
  } = useVideoMeta(id);
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

  // Load the user's target exam level from preferences on mount.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const prefs = await api<{ target_exam: string | null }>("/api/v1/users/me/preferences");
        if (cancelled) return;
        setSelectedExamLevel(prefs.target_exam ?? "cet4");
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

  // --- Keyboard shortcuts: only ArrowDown is handled here (advance subtitle,
  // which resets the speaking/recording state). Space/←/→/↑ are handled by
  // useVideoPlayer's own keydown listener — each key must be handled exactly
  // once (double registration made space a no-op and arrows seek/advance
  // twice).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleNextSubtitle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNextSubtitle]);

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
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-card hover:text-ink transition-colors cursor-pointer"
              onClick={toggleLike}
              aria-label={isLiked ? "取消点赞" : "点赞"}
              title={isLiked ? "取消点赞" : "点赞"}
            >
              <Heart size={18} className={cn(isLiked && "fill-current text-error")} />
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
          {video.forked_from && (
            <>
              <span>·</span>
              <ForkBadge forkedFrom={video.forked_from} />
            </>
          )}
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
                      // Draft/unpublished UGC media is gated server-side
                      // (publish-state access control) — attach the owner's
                      // JWT so previews keep working.
                      withToken: !video.is_official && video.review_status !== "published",
                    })}
                    controls
                    className="h-full w-full object-contain"
                    onTimeUpdate={(e) => {
                      const t = e.currentTarget.currentTime;
                      const idx = findSubtitleIndex(video.subtitles, t);
                      if (idx !== -1) setCurrentSubtitleIndex(idx);
                      trackWatchTime(id, t);
                    }}
                    onPlay={() =>
                      track("play", { position_s: videoRef.current?.currentTime ?? 0 }, id)
                    }
                    onPause={() =>
                      track("pause", { position_s: videoRef.current?.currentTime ?? 0 }, id)
                    }
                    onSeeked={() =>
                      track("seek", { position_s: videoRef.current?.currentTime ?? 0 }, id)
                    }
                    onEnded={() =>
                      track("complete", { position_s: videoRef.current?.currentTime ?? 0 }, id)
                    }
                  />
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
                  <div className="now-sub-en text-left leading-[1.7]">
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
                  {(subtitleMode === "bilingual" || subtitleMode === "chinese") &&
                    currentSubtitle.text_zh && (
                      <div className="now-sub-zh">{currentSubtitle.text_zh}</div>
                    )}
                </div>

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

              {/* 录音展开态：录音 / 回放 / 下一句 */}
              {speakingActive && (
                <div className="mt-4 pt-4 border-t border-hairline">
                  {speakingState === "idle" && (
                    <div className="flex items-center gap-3 bg-surface-soft rounded-lg p-3">
                      <button
                        className="w-11 h-11 rounded-full bg-brand-500 text-white flex items-center justify-center shadow-brand cursor-pointer"
                        onClick={startRecording}
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

                      {/* Audio players: original + mine */}
                      <div className="flex items-center gap-3">
                        <button
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                            bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors cursor-pointer"
                          onClick={playOriginal}
                        >
                          <Volume2 size={13} />
                          听原声
                        </button>
                        {audioUrl && (
                          <audio src={audioUrl} controls className="h-8 flex-1 max-w-xs" />
                        )}
                      </div>

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
                        <Button size="sm" onClick={handleNextSubtitle}>
                          下一句
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Shadowing history: recent attempts for this video */}
              <ShadowingHistory attempts={attempts} />
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

              {/* 字幕列表 —— 只保留核心三种模式 */}
              <div
                ref={subtitleListRef}
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
        <WordTooltipInline
          word={selectedWord}
          gloss={wordGloss}
          onClose={clearWord}
          onPronounce={() => speakWord(selectedWord)}
          onSave={saveToVocabulary}
        />
      )}
    </div>
  );
}
