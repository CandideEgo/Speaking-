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
import { UnifiedPracticePanel } from "@/components/practice/PracticePanels";
import { ShareToCommunityDialog } from "@/components/community/ShareToCommunityDialog";
import { api, mediaUrl } from "@/lib/api";
import { findSubtitleIndex } from "@/lib/subtitles";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import SubtitleModeTabs from "@/components/subtitle/SubtitleModeTabs";
import { AudioWaveform } from "@/components/speaking/AudioWaveform";
import {
  TARGET_LEVEL_OPTIONS,
  levelMeta,
  levelDotClass,
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
  Share2,
  BookOpen,
  Pencil,
  X,
  ChevronDown,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

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
    "idle" | "listening" | "reviewing" | "submitting" | "result"
  >("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [speakingResult, setSpeakingResult] = useState<{
    accuracy: number;
    fluency: number;
    completeness: number;
    feedback: string;
    transcript: string;
    word_scores?: { word: string; score: number; status: string }[];
    criteria_scores?: {
      name: string;
      score: number;
      feedback?: string | null;
      weight: number;
    }[];
    overall_score?: number | null;
  } | null>(null);
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

  // --- Account-scoped favorite & note (server-backed) ---
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const meta = await api<{ is_favorited: boolean; note: string }>(
          `/api/v1/videos/${id}/watch-meta`,
        );
        if (cancelled) return;
        setIsFavorited(meta.is_favorited);
        setNoteDraft(meta.note || "");
      } catch {
        // non-fatal: favorite/note UI just stays at defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function toggleFavorite() {
    if (!id) return;
    const wasFavorited = isFavorited;
    setIsFavorited(!wasFavorited); // optimistic
    try {
      await api(`/api/v1/videos/${id}/favorite`, {
        method: wasFavorited ? "DELETE" : "POST",
      });
      toast.success(wasFavorited ? "已取消收藏" : "已收藏视频");
    } catch {
      setIsFavorited(wasFavorited); // rollback
      toast.error("操作失败，请重试");
    }
  }

  function handleShare() {
    // Open the share-to-community dialog (POSTs a video_share post).
    requireAuth() && setShareOpen(true);
  }

  async function saveNote() {
    if (!id) return;
    try {
      await api(`/api/v1/videos/${id}/note`, {
        method: "PUT",
        body: JSON.stringify({ content: noteDraft.trim() }),
      });
      toast.success("笔记已保存");
    } catch {
      toast.error("笔记保存失败，请重试");
    }
  }

  async function clearNote() {
    if (!id) return;
    setNoteDraft("");
    try {
      await api(`/api/v1/videos/${id}/note`, { method: "DELETE" });
      toast.success("笔记已清空");
    } catch {
      toast.error("清空失败，请重试");
    }
  }

  // --- Speaking functions (inline, replaces SpeakingPanel component) ---
  function stopSpeaking() {
    if (mediaRecorderRef.current?.state === "recording")
      mediaRecorderRef.current.stop();
    recordingStream?.getTracks().forEach((t) => t.stop());
    setRecordingStream(null);
    setSpeakingState("idle");
    setSpeakingResult(null);
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

  async function submitForFeedback() {
    if (!audioUrl || !video?.subtitles[currentSubtitleIndex]) return;
    setSpeakingState("submitting");
    // 评分含 Whisper+对齐+LLM，可能耗时数十秒；120s 超时兜底，避免无限转圈
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const blob = await fetch(audioUrl).then((r) => r.blob());
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("subtitle_id", video.subtitles[currentSubtitleIndex].id);
      const result = await api<{
        accuracy: number;
        fluency: number;
        completeness: number;
        feedback: string;
        transcript: string;
        word_scores?: { word: string; score: number; status: string }[];
        criteria_scores?: {
          name: string;
          score: number;
          feedback?: string | null;
          weight: number;
        }[];
        overall_score?: number | null;
      }>("/api/v1/speaking/practice", {
        method: "POST",
        body: form,
        headers: {} as Record<string, string>,
        signal: controller.signal,
      });
      setSpeakingResult(result);
      setSpeakingState("result");
    } catch (e) {
      setSpeakingState("reviewing");
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.error("评分超时，请稍后重试");
      } else {
        toast.error("评分失败，请重试");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  function reRecord() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setSpeakingState("idle");
    setSpeakingResult(null);
  }

  function handleNextSubtitle() {
    if (!video?.subtitles) return;
    if (currentSubtitleIndex < video.subtitles.length - 1) {
      const next = video.subtitles[currentSubtitleIndex + 1];
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

  // 逐词发音着色：correct 绿 / partial 黄 / missing 红删除线 / extra 灰
  function wordScoreClass(status: string): string {
    switch (status) {
      case "correct":
        return "text-success font-medium";
      case "partial":
        return "text-amber-600";
      case "missing":
        return "text-red-500 line-through";
      case "extra":
        return "text-muted";
      default:
        return "text-ink";
    }
  }

  // --- Loading / Error states ---
  if (!video)
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 size={24} className="animate-spin text-brand-500" />
      </main>
    );

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
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <p className="text-ink font-bold">处理失败</p>
          <p className="mt-1 text-sm text-error">
            {video.error_message || "未知错误"}
          </p>
          <button
            onClick={() => router.push("/browse")}
            className="mt-4 text-sm text-brand-500 hover:underline"
          >
            返回浏览
          </button>
        </div>
      </main>
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
                          录音完成，点击提交获取评分
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
                        <Button size="sm" onClick={submitForFeedback}>
                          提交
                        </Button>
                      </div>
                    </div>
                  )}

                  {speakingState === "submitting" && (
                    <div className="flex items-center gap-3 bg-surface-soft rounded-lg p-3">
                      <Loader2
                        size={20}
                        className="animate-spin text-brand-500"
                      />
                      <p className="text-[13px] font-semibold text-ink">
                        AI 评分中…
                      </p>
                    </div>
                  )}

                  {speakingResult && speakingState === "result" && (
                    <div className="bg-surface-soft rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-success-soft text-success flex items-center justify-center font-bold text-sm shrink-0">
                          {Math.round(
                            speakingResult.overall_score ??
                              (speakingResult.accuracy +
                                speakingResult.fluency +
                                speakingResult.completeness) /
                                3,
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {(
                            speakingResult.criteria_scores ?? [
                              {
                                name: "发音",
                                score: speakingResult.accuracy,
                                weight: 1,
                              },
                              {
                                name: "流利度",
                                score: speakingResult.fluency,
                                weight: 1,
                              },
                              {
                                name: "完整度",
                                score: speakingResult.completeness,
                                weight: 1,
                              },
                            ]
                          ).map((c) => (
                            <div
                              key={c.name}
                              className="flex items-center gap-2"
                            >
                              <span className="w-14 text-[11px] text-muted shrink-0">
                                {c.name}
                              </span>
                              <div className="flex-1 h-1.5 bg-hairline rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand-500 rounded-full"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, c.score))}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[11px] font-semibold text-ink w-7 text-right">
                                {Math.round(c.score)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {speakingResult.word_scores &&
                        speakingResult.word_scores.length > 0 && (
                          <div className="flex flex-wrap gap-x-1.5 gap-y-1 leading-relaxed">
                            {speakingResult.word_scores.map((w, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "text-[13px]",
                                  wordScoreClass(w.status),
                                )}
                              >
                                {w.word}
                              </span>
                            ))}
                          </div>
                        )}

                      {speakingResult.feedback && (
                        <p className="text-xs text-muted">
                          {speakingResult.feedback}
                        </p>
                      )}

                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={reRecord}>
                          再练一次
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

/** Inline word tooltip — rich gloss (ECDICT static + AI contextual notes).
 *  可拖动浮动卡：默认停泊右下角，pointer 拖动改位置，边界自动夹紧。 */
function WordTooltipInline({
  word,
  gloss,
  onClose,
  onPronounce,
  onSave,
}: {
  word: string;
  gloss: WordGloss | null;
  onClose: () => void;
  onPronounce: () => void;
  onSave: () => Promise<void>;
}) {
  const loading = !gloss;
  const cardRef = useRef<HTMLDivElement>(null);
  // pos 为 null 时使用默认停泊位（右下角）；拖动后切换为 left/top 定位。
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    // 从按钮上发起的按压不触发拖动
    if ((e.target as HTMLElement).closest("button")) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragOffset.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragOffset.current) return;
    const card = cardRef.current;
    const w = card?.offsetWidth ?? 360;
    const h = card?.offsetHeight ?? 220;
    const maxX = window.innerWidth - w - 8;
    const maxY = window.innerHeight - h - 8;
    const x = Math.max(8, Math.min(e.clientX - dragOffset.current.dx, maxX));
    const y = Math.max(8, Math.min(e.clientY - dragOffset.current.dy, maxY));
    setPos({ x, y });
  }

  function onPointerUp(e: React.PointerEvent) {
    dragOffset.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointerId may already be released
    }
  }

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 24, bottom: 24, left: "auto", top: "auto" };

  return (
    <div
      ref={cardRef}
      style={style}
      className="fixed z-50 bg-canvas border border-hairline rounded-lg shadow-lift p-4 w-[min(92vw,360px)] touch-none"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex items-start justify-between mb-2 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-ink">
              {gloss?.lemma || word}
            </span>
            {gloss?.phonetic && (
              <span className="text-xs text-muted">/{gloss.phonetic}/</span>
            )}
            {gloss?.pos && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-soft text-muted">
                {gloss.pos}
              </span>
            )}
          </div>
          {gloss && gloss.levels.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {gloss.levels.map((lv) => {
                const meta = levelMeta(lv);
                if (!meta) return null;
                return (
                  <span
                    key={lv}
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded",
                      wordHighlightClass([lv]),
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        levelDotClass(meta.color),
                      )}
                    />
                    {meta.label}
                  </span>
                );
              })}
              {gloss?.is_high_freq && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                  <GraduationCap size={10} /> 真题高频
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-ink transition-colors shrink-0"
          aria-label="关闭"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted mb-3">查询中...</p>
      ) : (
        <div className="mb-3 space-y-1.5">
          {gloss?.definition && (
            <p className="text-xs text-muted leading-relaxed">
              {gloss.definition}
            </p>
          )}
          {gloss?.translation && (
            <p className="text-sm text-ink leading-relaxed">
              {gloss.translation}
            </p>
          )}
          {gloss?.contextual_note && (
            <p className="text-xs text-ink/80 leading-relaxed">
              <span className="text-muted">语境释义：</span>
              {gloss.contextual_note}
            </p>
          )}
          {gloss?.pitfalls && (
            <p className="text-xs text-orange-700/90 leading-relaxed">
              <span className="text-muted">易错点：</span>
              {gloss.pitfalls}
            </p>
          )}
          {gloss?.knowledge && (
            <p className="text-xs text-brand-600/90 leading-relaxed">
              <span className="text-muted">拓展：</span>
              {gloss.knowledge}
            </p>
          )}
          {gloss?.example_sentence && (
            <div className="text-xs leading-relaxed border-l-2 border-amber-300 pl-2">
              <p className="text-ink/80 italic">{gloss.example_sentence}</p>
              {gloss.example_sentence_zh && (
                <p className="text-muted mt-0.5">{gloss.example_sentence_zh}</p>
              )}
              {gloss.example_source && (
                <p className="text-[10px] text-muted/70 mt-0.5">
                  — {gloss.example_source}
                </p>
              )}
            </div>
          )}
          {!gloss?.definition &&
            !gloss?.translation &&
            !gloss?.contextual_note && (
              <p className="text-sm text-muted">暂无释义</p>
            )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onPronounce}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 5 6 9H2v6h4l5 4V5Z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          发音
        </Button>
        <Button size="sm" onClick={onSave}>
          <Bookmark size={14} /> 加入词汇本
        </Button>
      </div>
    </div>
  );
}

/** 考试目标层级选择器：播放器右上角收起药丸，点开下拉，不干扰观看。 */
function ExamLevelSelector({
  level,
  onChange,
}: {
  level: string | null;
  onChange: (level: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = levelMeta(level ?? "cet4") ?? TARGET_LEVEL_OPTIONS[0];
  return (
    <div className="absolute top-3 right-3 z-20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/55 backdrop-blur text-white text-xs font-medium hover:bg-black/70 transition-colors cursor-pointer"
      >
        <span
          className={cn("w-2 h-2 rounded-full", levelDotClass(current.color))}
        />
        {current.label}
        <ChevronDown
          size={13}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-canvas border border-hairline rounded-lg shadow-lift p-1 min-w-[120px]">
            {TARGET_LEVEL_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  onChange(opt.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left cursor-pointer transition-colors",
                  opt.key === current.key
                    ? "bg-brand-50 text-brand-600 font-semibold"
                    : "text-ink hover:bg-surface-soft",
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    levelDotClass(opt.color),
                  )}
                />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
