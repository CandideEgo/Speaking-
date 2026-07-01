"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useWatchStore } from "@/stores/watchStore";
import { useAuthStore } from "@/stores/authStore";
import { useVideoPlayer } from "@/hooks/useVideoPlayer";
import { useQuiz } from "@/hooks/useQuiz";
import { useWordLookup } from "@/hooks/useWordLookup";
import { usePracticeMode } from "@/hooks/usePracticeMode";
import { useVocabDrill } from "@/hooks/useVocabDrill";
import { useVideoMeta } from "@/hooks/useVideoMeta";
import { UnifiedPracticePanel } from "@/components/practice/PracticePanels";
import { ShareToCommunityDialog } from "@/components/community/ShareToCommunityDialog";
import { api, mediaUrl } from "@/lib/api";
import { findSubtitleIndex } from "@/lib/subtitles";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import SubtitleModeTabs from "@/components/subtitle/SubtitleModeTabs";
import { WordTooltipInline } from "@/components/subtitle/WordTooltipInline";
import { ExamLevelSelector } from "@/components/watch/ExamLevelSelector";
import { AudioWaveform } from "@/components/speaking/AudioWaveform";
import {
  levelMeta,
  shouldDisplay,
  wordHighlightClass,
  cleanToken,
} from "@/lib/examLevels";
import type { WordGloss } from "@/types";
import {
  ArrowLeft,
  Loader2,
  Play,
  Mic,
  Bookmark,
  Heart,
  Share2,
  BookOpen,
  Pencil,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";

/** Human-readable labels for processing steps returned by the backend. */
const STEP_LABELS: Record<string, string> = {
  extracting: "提取视频信息...",
  transcribing: "语音转录中...",
  splitting: "说话人识别中...",
  translating: "字幕翻译中...",
  annotating: "标注考试词汇中...",
  downloading: "下载视频中...",
  transcoding: "视频转码中...",
};

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [speakingActive, setSpeakingActive] = useState(false);
  const [speakingState, setSpeakingState] = useState<
    "idle" | "listening" | "reviewing"
  >("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(
    null,
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const setVideoAspectRatio = useWatchStore((s) => s.setVideoAspectRatio);
  const {
    video,
    playbackMode,
    currentSubtitleIndex,
    setCurrentSubtitleIndex,
    videoRef,
    seekTo,
    retry,
  } = useVideoPlayer({
    videoId: id,
    setVideoAspectRatio,
  });

  // 字幕自动居中：只滚动右侧内层字幕列表，绝不触碰整页 <main>。
  // 用 scrollIntoView 会连带 <main> 一起拽回顶部，导致停在底部练习区时页面被拽走白屏。
  const subtitleListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = subtitleListRef.current;
    const el = document.getElementById(`subtitle-${currentSubtitleIndex}`);
    if (!container || !el) return;
    const elTop = el.getBoundingClientRect().top;
    const cTop = container.getBoundingClientRect().top;
    const offset =
      elTop - cTop - (container.clientHeight / 2 - el.clientHeight / 2);
    // 仅当目标句偏离容器中心超过半句高时才滚，避免每次 timeUpdate 都抖动
    if (Math.abs(offset) > el.clientHeight / 2) {
      container.scrollBy({ top: offset, behavior: "smooth" });
    }
  }, [currentSubtitleIndex]);

  const quiz = useQuiz({ videoId: id });
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const requireAuth = (): boolean => {
    if (isLoading || !isAuthenticated) {
      router.push("/login");
      return false;
    }
    return true;
  };
  const {
    selectedWord,
    wordGloss,
    handleWordClick,
    saveToVocabulary,
    speakWord,
    clearWord,
  } = useWordLookup({
    requireAuth,
    getSubtitles: () => video?.subtitles,
    videoId: id,
  });

  const subtitleMode = useWatchStore((s) => s.subtitleMode);
  const panelCollapsed = useWatchStore((s) => s.panelCollapsed);
  const setPanelCollapsed = useWatchStore((s) => s.setPanelCollapsed);
  const selectedExamLevel = useWatchStore((s) => s.selectedExamLevel);
  const setSelectedExamLevel = useWatchStore((s) => s.setSelectedExamLevel);

  // --- Practice mode (CET/高考/考研, per-level AI questions) ---
  const practice = usePracticeMode({ videoId: id, level: selectedExamLevel });

  // --- Vocabulary drill (free-tier, deterministic, per-level) ---
  const vocabDrill = useVocabDrill({ videoId: id, level: selectedExamLevel });

  // Whether the current user is Pro (for gating reading/sentence_building
  // client-side; the practice endpoint still enforces server-side via 403).
  const [isPro, setIsPro] = useState(false);

  // Load the user's target exam level + plan from preferences/me on mount.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const [prefs, me] = await Promise.all([
          api<{ target_exam: string | null }>("/api/v1/users/me/preferences"),
          api<{ plan: string }>("/api/v1/users/me").catch(() => null),
        ]);
        if (cancelled) return;
        setSelectedExamLevel(prefs.target_exam ?? "cet4");
        if (me) setIsPro(me.plan === "pro");
      } catch {
        if (!cancelled) setSelectedExamLevel("cet4");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setSelectedExamLevel]);

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
    }
  }

  function handleShare() {
    requireAuth() && setShareOpen(true);
  }

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
      // echoCancellation + noiseSuppression 提升跟读音质（主入口此前只传 {audio:true}）
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

  function handleNextSubtitle() {
    if (!video?.subtitles) return;
    if (currentSubtitleIndex < video.subtitles.length - 1) {
      const next = video.subtitles[currentSubtitleIndex + 1];
      if (!next) return;
      // Reset speaking state before advancing — otherwise the user is stuck
      // in the result view of the old sentence.
      if (speakingActive) reRecord();
      setCurrentSubtitleIndex(currentSubtitleIndex + 1);
      seekTo(next.start_time);
    }
  }

  // Exam-level word highlight: returns tailwind class if the word should be
  // highlighted for the user's selected target level, else "".
  function levelClassFor(
    word: string,
    wordLevels: Record<string, string[]> | null,
  ): string {
    if (!wordLevels || !selectedExamLevel) return "";
    const levels = wordLevels[cleanToken(word)];
    if (!levels || !shouldDisplay(levels, selectedExamLevel)) return "";
    return wordHighlightClass(levels);
  }

  function isSelectedWord(word: string): boolean {
    if (!selectedWord) return false;
    return selectedWord === cleanToken(word);
  }

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
          <p className="mt-1 text-sm text-muted">
            视频下载和转码需要几分钟，请稍候
          </p>
          {video.status === "ready_subtitles" && (
            <p className="mt-2 text-xs text-accent-teal">
              字幕已就绪，视频处理中...
            </p>
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
    <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-4">
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
              <Heart
                size={18}
                className={cn(isLiked && "fill-current text-red-500")}
              />
            </button>
            <button
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-card hover:text-ink transition-colors cursor-pointer"
              onClick={toggleFavorite}
              aria-label={isFavorited ? "取消收藏" : "收藏视频"}
              title={isFavorited ? "取消收藏" : "收藏"}
            >
              <Bookmark
                size={18}
                className={cn(isFavorited && "fill-current text-brand-500")}
              />
            </button>
            <button
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-card hover:text-ink transition-colors cursor-pointer"
              onClick={handleShare}
              aria-label="分享"
              title="分享"
            >
              <Share2 size={18} />
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
                  : "text-muted hover:bg-surface-card hover:text-ink",
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
          <span className="font-semibold text-ink">Speaking</span>
          <span>·</span>
          <span>{video.difficulty_level || "B2"}</span>
          <span>·</span>
          <span>{formatDuration(video.duration)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5">
            <Heart
              size={11}
              className={cn(isLiked && "fill-current text-red-500")}
            />
            {video.like_count}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5">
            <Bookmark
              size={11}
              className={cn(isFavorited && "fill-current text-brand-500")}
            />
            {video.favorite_count}
          </span>
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

      {/* ===== 双列：左视频+字幕+跟读，右字幕面板（可折叠） ===== */}
      <div
        className={cn(
          "grid grid-cols-1 gap-6 items-start transition-[grid-template-columns] duration-200",
          panelCollapsed
            ? "lg:grid-cols-[1fr_220px]"
            : "lg:grid-cols-[2fr_1fr]",
        )}
      >
        {/* ========== LEFT COLUMN ========== */}
        <div className="min-w-0">
          {/* Video player —— 宽高比驱动（不依赖父级高度链，避免塌缩黑屏） */}
          <div className="relative w-full aspect-video bg-ink rounded-xl overflow-hidden shadow-lift">
            {playbackMode === "ready" && video.video_url_720p ? (
              <video
                ref={videoRef}
                src={mediaUrl(video.video_url_720p)}
                controls
                className="h-full w-full object-contain"
                onTimeUpdate={(e) => {
                  const idx = findSubtitleIndex(
                    video.subtitles,
                    e.currentTarget.currentTime,
                  );
                  if (idx !== -1) setCurrentSubtitleIndex(idx);
                }}
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <div className="text-center">
                  <Play size={40} className="mx-auto text-white/30" />
                  <p className="mt-3 text-sm text-white/40">视频未就绪</p>
                </div>
              </div>
            )}
            {/* 考试目标层级选择器：右上角收起药丸，不干扰观看 */}
            <ExamLevelSelector
              level={selectedExamLevel}
              onChange={handleExamLevelChange}
            />
          </div>

          {/* 字幕卡：紧贴视频正下方，跟读按钮行内（次要操作，按需展开） */}
          {currentSubtitle && (
            <div className="mt-3 bg-canvas border border-hairline rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="now-sub-en !text-left !leading-[1.7]">
                    {currentSubtitle.text_en.split(" ").map((word, i) => (
                      <span
                        key={i}
                        className={cn(
                          "now-sub-word",
                          levelClassFor(word, currentSubtitle.word_levels),
                          isSelectedWord(word) && "now-sub-word-hl",
                        )}
                        onClick={() => handleWordClick(word)}
                      >
                        {word}{" "}
                      </span>
                    ))}
                  </div>
                  {(subtitleMode === "bilingual" ||
                    subtitleMode === "chinese") &&
                    currentSubtitle.text_zh && (
                      <div className="now-sub-zh !mt-1.5">
                        {currentSubtitle.text_zh}
                      </div>
                    )}
                </div>

                {/* 跟读：默认只一个小按钮，点击才展开录音 UI */}
                <button
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer",
                    speakingActive
                      ? "bg-brand-500 text-white shadow-brand"
                      : "text-brand-500 bg-brand-50 hover:bg-brand-100",
                  )}
                  onClick={() => {
                    if (speakingActive) stopSpeaking();
                    else startRecording();
                  }}
                >
                  <Mic size={15} />
                  跟读
                </button>
              </div>

              {/* 跟读展开态：录音 / 评分 / 结果 */}
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
                        <p className="text-[13px] font-semibold text-ink">
                          点击麦克风开始录音
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          朗读上方高亮字幕
                        </p>
                      </div>
                    </div>
                  )}

                  {speakingState === "listening" && (
                    <div className="flex items-center gap-3 bg-surface-soft rounded-lg p-3">
                      <button
                        className="w-11 h-11 rounded-full bg-red-500 text-white flex items-center justify-center shadow-brand animate-pulse cursor-pointer"
                        onClick={stopRecording}
                      >
                        <Mic size={20} />
                      </button>
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-ink">
                          录音中…
                        </p>
                        <div className="mt-1">
                          <AudioWaveform
                            stream={recordingStream}
                            barCount={24}
                          />
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
                    <div className="flex items-center gap-3 bg-surface-soft rounded-lg p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-ink mb-2">
                          录音完成，回放听自己的发音
                        </p>
                        {audioUrl && (
                          <audio
                            src={audioUrl}
                            controls
                            className="h-8 w-full max-w-md"
                          />
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={reRecord}>
                          重录
                        </Button>
                        <Button size="sm" onClick={handleNextSubtitle}>
                          下一句
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========== RIGHT COLUMN：字幕面板，可折叠为窄轨 ========== */}
        <aside className="bg-canvas border border-hairline rounded-xl lg:sticky lg:top-[88px] overflow-hidden min-w-0">
          {/* 头部：模式切换 + 折叠按钮 常驻同一行，切换模式不跳位 */}
          <div className="border-b border-hairline">
            <SubtitleModeTabs
              collapsed={panelCollapsed}
              onToggleCollapse={() => setPanelCollapsed(!panelCollapsed)}
              compact={panelCollapsed}
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
                    "w-full text-left rounded-lg border-l-[3px] border-transparent cursor-pointer transition-colors duration-100 hover:bg-surface-soft",
                    panelCollapsed ? "p-2" : "p-3",
                    i === currentSubtitleIndex &&
                      "bg-brand-50 border-l-brand-500",
                  )}
                >
                  {subtitleMode !== "chinese" && (
                    <div
                      className={cn(
                        "font-medium",
                        panelCollapsed
                          ? "text-[12px] leading-snug"
                          : "text-sm leading-relaxed",
                        i === currentSubtitleIndex
                          ? "text-brand-500"
                          : "text-ink",
                      )}
                    >
                      {sub.text_en.split(" ").map((word, wi) => (
                        <span
                          key={wi}
                          className={levelClassFor(word, sub.word_levels)}
                        >
                          {word}{" "}
                        </span>
                      ))}
                    </div>
                  )}
                  {(subtitleMode === "bilingual" ||
                    subtitleMode === "chinese") &&
                    sub.text_zh && (
                      <div
                        className={cn(
                          "text-muted mt-0.5",
                          panelCollapsed
                            ? "text-[11px] leading-snug"
                            : "text-xs",
                        )}
                      >
                        {sub.text_zh}
                      </div>
                    )}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* ===== 练习区：词汇练习 / AI 练习 / 理解测验 三合一 ===== */}
      <div className="mt-6">
        <UnifiedPracticePanel
          vocab={vocabDrill}
          practice={practice}
          quiz={quiz}
          isPro={isPro}
          levelLabel={levelMeta(selectedExamLevel ?? "cet4")?.label ?? "四级"}
        />
      </div>

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

      {/* Share-to-community dialog */}
      <ShareToCommunityDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        videoId={video.id}
        videoTitle={video.title}
      />
    </div>
  );
}
