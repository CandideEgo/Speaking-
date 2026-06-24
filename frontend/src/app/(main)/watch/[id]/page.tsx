"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useWatchStore } from "@/stores/watchStore";
import { useAuthStore } from "@/stores/authStore";
import { useVideoPlayer } from "@/hooks/useVideoPlayer";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { useQuiz } from "@/hooks/useQuiz";
import { useWordLookup } from "@/hooks/useWordLookup";
import { mediaUrl } from "@/lib/api";
import { findSubtitleIndex } from "@/lib/subtitles";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import SubtitleModeTabs from "@/components/subtitle/SubtitleModeTabs";
import ReadingMode from "@/components/speaking/ReadingMode";
import DictationMode from "@/components/speaking/DictationMode";
import FillBlankMode from "@/components/speaking/FillBlankMode";
import TranslateMode from "@/components/speaking/TranslateMode";
import FlashcardMode from "@/components/vocabulary/FlashcardMode";
import { ArrowLeft, Loader2, Play, Mic, Bookmark, Share2, BookOpen, Pencil, X } from "lucide-react";

/** Human-readable labels for processing steps returned by the backend. */
const STEP_LABELS: Record<string, string> = {
  extracting: "提取视频信息...",
  transcribing: "语音转录中...",
  splitting: "说话人识别中...",
  translating: "字幕翻译中...",
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
  const [speakingResult, setSpeakingResult] = useState<{
    accuracy: number;
    fluency: number;
    completeness: number;
    feedback: string;
    transcript: string;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const setVideoAspectRatio = useWatchStore((s) => s.setVideoAspectRatio);
  const { video, playbackMode, currentSubtitleIndex, setCurrentSubtitleIndex, videoRef, seekTo } =
    useVideoPlayer({
      videoId: id,
      setVideoAspectRatio,
    });
  const ytPlayer = useYouTubePlayer();
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytTimeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Whether to show the YouTube embed as fallback
  const showYouTube = !!video?.youtube_video_id && playbackMode !== "ready";

  // Initialize YouTube player when fallback is needed
  useEffect(() => {
    if (!showYouTube || !video?.youtube_video_id) return;
    ytPlayer.initPlayer("yt-player-container", video.youtube_video_id, undefined, undefined);
    return () => {
      ytPlayer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showYouTube, video?.youtube_video_id]);

  // Destroy YouTube player when local video becomes ready
  useEffect(() => {
    if (playbackMode === "ready" && ytPlayer.isReady) {
      ytPlayer.destroy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackMode]);

  // Sync subtitles with YouTube player time
  useEffect(() => {
    if (!showYouTube || !ytPlayer.isReady || !video?.subtitles) return;

    ytTimeRef.current = setInterval(() => {
      ytPlayer.getCurrentTime().then((time) => {
        const idx = findSubtitleIndex(video.subtitles, time);
        if (idx !== -1) setCurrentSubtitleIndex(idx);
      });
    }, 500);

    return () => {
      if (ytTimeRef.current) clearInterval(ytTimeRef.current);
    };
  }, [showYouTube, ytPlayer.isReady, video?.subtitles, setCurrentSubtitleIndex, ytPlayer]);

  const { quizQuestions, quizAnswers, quizSubmitted, quizScore, handleQuizAnswer, submitQuiz } =
    useQuiz({ videoId: id });
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const requireAuth = (): boolean => {
    if (isLoading || !isAuthenticated) {
      router.push("/login");
      return false;
    }
    return true;
  };
  const { selectedWord, wordMeaning, handleWordClick, saveToVocabulary, speakWord, clearWord } =
    useWordLookup({ requireAuth, getSubtitles: () => video?.subtitles, videoId: id });

  const subtitleMode = useWatchStore((s) => s.subtitleMode);

  // --- LocalStorage-backed favorite & note ---
  useEffect(() => {
    if (!id) return;
    try {
      const favs = JSON.parse(localStorage.getItem("speaking:favorites") || "[]") as string[];
      setIsFavorited(favs.includes(id));
      setNoteDraft(localStorage.getItem(`speaking:notes:${id}`) || "");
    } catch {
      // ignore malformed localStorage
    }
  }, [id]);

  function toggleFavorite() {
    if (!id) return;
    const key = "speaking:favorites";
    const favs = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    const next = favs.includes(id) ? favs.filter((v) => v !== id) : [...favs, id];
    localStorage.setItem(key, JSON.stringify(next));
    setIsFavorited(!isFavorited);
    toast.success(isFavorited ? "已取消收藏" : "已收藏视频");
  }

  async function handleShare() {
    const url = window.location.href;
    const title = video?.title || "Speaking 英语学习视频";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.success("链接已复制到剪贴板");
      } else {
        toast.error("当前浏览器不支持分享");
      }
    } catch {
      // user cancelled share
    }
  }

  function saveNote() {
    if (!id) return;
    localStorage.setItem(`speaking:notes:${id}`, noteDraft.trim());
    toast.success("笔记已保存");
  }

  // --- Speaking functions (inline, replaces SpeakingPanel component) ---
  function stopSpeaking() {
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = r;
      chunksRef.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      r.onstop = () => {
        setAudioUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: "audio/webm" })));
        setSpeakingState("reviewing");
        stream.getTracks().forEach((t) => t.stop());
      };
      r.start();
      setSpeakingState("listening");
    } catch {
      // toast handled elsewhere
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function submitForFeedback() {
    if (!audioUrl || !video?.subtitles[currentSubtitleIndex]) return;
    setSpeakingState("submitting");
    try {
      const blob = await fetch(audioUrl).then((r) => r.blob());
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("subtitle_id", video.subtitles[currentSubtitleIndex].id);
      const { api } = await import("@/lib/api");
      const result = await api<{
        accuracy: number;
        fluency: number;
        completeness: number;
        feedback: string;
        transcript: string;
      }>("/api/v1/speaking/practice", {
        method: "POST",
        body: form,
        headers: {} as Record<string, string>,
      });
      setSpeakingResult(result);
      setSpeakingState("result");
    } catch {
      setSpeakingState("reviewing");
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
      setCurrentSubtitleIndex(currentSubtitleIndex + 1);
      seekTo(next.start_time);
    }
  }

  // Word highlight helper
  function isHighlighted(word: string): boolean {
    if (!selectedWord) return false;
    const clean = word.replace(/[.,!?;:'"()\[\]]/g, "");
    return selectedWord === clean;
  }

  // --- Loading / Error states ---
  if (!video)
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 size={24} className="animate-spin text-brand-500" />
      </main>
    );

  if (playbackMode === "processing" && !video.youtube_video_id) {
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
            <p className="mt-2 text-xs text-accent-teal">字幕已就绪，视频处理中...</p>
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
          <p className="mt-1 text-sm text-error">{video.error_message || "未知错误"}</p>
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
    <div className="container-page pt-6 pb-20">
      {/* Back link */}
      <a
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink transition-colors mb-4 cursor-pointer"
        onClick={() => router.push("/browse")}
      >
        <ArrowLeft size={14} />
        返回浏览
      </a>

      {/* 2-column grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-6 items-start">
        {/* ========== LEFT COLUMN ========== */}
        <div>
          {/* Video player */}
          <div className="bg-ink rounded-lg overflow-hidden aspect-video">
            {playbackMode === "ready" && video.video_url_720p ? (
              <video
                ref={videoRef}
                src={mediaUrl(video.video_url_720p)}
                controls
                className="w-full h-full object-contain"
                onTimeUpdate={(e) => {
                  const idx = findSubtitleIndex(video.subtitles, e.currentTarget.currentTime);
                  if (idx !== -1) setCurrentSubtitleIndex(idx);
                }}
              />
            ) : showYouTube ? (
              <div ref={ytContainerRef} className="w-full h-full">
                <div id="yt-player-container" className="w-full h-full" />
              </div>
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <div className="text-center">
                  <Play size={40} className="mx-auto text-white/30" />
                  <p className="mt-3 text-sm text-white/40">视频未就绪</p>
                </div>
              </div>
            )}
          </div>

          {/* Title + meta */}
          <h1 className="text-[22px] font-bold tracking-tight mt-4 mb-2 leading-snug">
            {video.title}
          </h1>
          <div className="flex items-center gap-3 text-[13px] text-muted flex-wrap mb-5">
            <span className="font-semibold text-ink">Speaking</span>
            <span>·</span>
            <span>{video.difficulty_level || "B2"}</span>
            <span>·</span>
            <span>{formatDuration(video.duration)}</span>
          </div>

          {/* Action pills */}
          <div className="flex gap-2.5 flex-wrap mb-5">
            <button
              className={cn("act", speakingActive && "act-active")}
              onClick={() => {
                if (speakingActive) stopSpeaking();
                else startRecording();
              }}
            >
              <Mic size={16} /> 口语练习
            </button>
            <button
              className={cn("act", isFavorited && "act-active")}
              onClick={toggleFavorite}
              aria-label={isFavorited ? "取消收藏" : "收藏视频"}
            >
              <Bookmark size={16} className={cn(isFavorited && "fill-current")} /> 收藏
            </button>
            <button className="act" onClick={handleShare}>
              <Share2 size={16} /> 分享
            </button>
            <button className="act" onClick={() => router.push("/vocabulary")}>
              <BookOpen size={16} /> 词汇本
            </button>
            <button
              className={cn("act", noteOpen && "act-active")}
              onClick={() => setNoteOpen((v) => !v)}
            >
              <Pencil size={16} /> 笔记
            </button>
          </div>

          {/* Note drawer */}
          {noteOpen && (
            <div className="bg-canvas border border-hairline rounded-lg p-4 mb-5 animate-fade-in">
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
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="记录重点句型、生词或心得..."
                rows={4}
                className="input-field resize-none mb-3"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setNoteDraft("");
                    if (id) localStorage.removeItem(`speaking:notes:${id}`);
                    toast.success("笔记已清空");
                  }}
                  className="btn-outline !py-2 !text-xs"
                >
                  清空
                </button>
                <button onClick={saveNote} className="btn-primary !py-2 !text-xs">
                  保存
                </button>
              </div>
            </div>
          )}

          {/* Current subtitle display */}
          {currentSubtitle && (
            <div className="now-sub">
              <div className="now-sub-en">
                {currentSubtitle.text_en.split(" ").map((word, i) => (
                  <span
                    key={i}
                    className={cn("now-sub-word", isHighlighted(word) && "now-sub-word-hl")}
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
          )}

          {/* Speaking block */}
          <div className="speak-block">
            <h3 className="!text-[17px] !font-bold !m-0 !mb-1">跟着这一句读</h3>
            <p className="text-[14px] leading-relaxed opacity-90 m-0 mb-[18px]">
              &ldquo;{currentSubtitle?.text_en}&rdquo;
            </p>

            {speakingState === "idle" && (
              <div className="speak-meter">
                <button className="mic-btn" onClick={startRecording}>
                  <Mic className="h-[22px] w-[22px]" />
                </button>
                <div className="flex-1">
                  <div className="text-[22px] font-extrabold tracking-tight">
                    -- <span className="text-[13px] opacity-80 font-semibold">/ 100</span>
                  </div>
                  <div className="text-xs opacity-85">点击麦克风开始录音</div>
                </div>
                <div className="flex items-center gap-[3px] h-7">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="w-[3px] bg-white/75 rounded-[2px] animate-wave-bar"
                      style={{
                        height: ["40%", "80%", "60%", "100%", "50%", "75%"][i],
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {speakingState === "listening" && (
              <div className="speak-meter">
                <button
                  className="mic-btn !bg-red-500 !text-white animate-pulse"
                  onClick={stopRecording}
                >
                  <Mic className="h-[22px] w-[22px]" />
                </button>
                <div className="flex-1">
                  <div className="text-[22px] font-extrabold tracking-tight">录音中...</div>
                  <div className="text-xs opacity-85">再次点击停止录音</div>
                </div>
                <div className="flex items-center gap-[3px] h-7">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="w-[3px] bg-white/75 rounded-[2px] animate-wave-bar"
                      style={{
                        height: ["40%", "80%", "60%", "100%", "50%", "75%"][i],
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {speakingState === "reviewing" && (
              <div className="speak-meter">
                <div className="flex-1">
                  <p className="text-sm opacity-90 mb-2">录音完成，点击提交获取评分</p>
                  {audioUrl && <audio src={audioUrl} controls className="h-8 w-full max-w-md" />}
                </div>
                <div className="flex gap-2 ml-3">
                  <button className="btn-outline !py-2 !text-xs" onClick={reRecord}>
                    重录
                  </button>
                  <button className="btn-primary !py-2 !text-xs" onClick={submitForFeedback}>
                    提交
                  </button>
                </div>
              </div>
            )}

            {speakingState === "submitting" && (
              <div className="speak-meter">
                <div className="flex-1">
                  <div className="text-[22px] font-extrabold tracking-tight">AI 评分中...</div>
                  <div className="text-xs opacity-85">请稍候</div>
                </div>
              </div>
            )}

            {speakingResult && speakingState === "result" && (
              <div className="speak-meter">
                <button className="mic-btn" onClick={reRecord}>
                  <Mic className="h-[22px] w-[22px]" />
                </button>
                <div className="flex-1">
                  <div className="text-[22px] font-extrabold tracking-tight">
                    {Math.round(
                      (speakingResult.accuracy +
                        speakingResult.fluency +
                        speakingResult.completeness) /
                        3
                    )}{" "}
                    <span className="text-[13px] opacity-80 font-semibold">/ 100</span>
                  </div>
                  <div className="text-xs opacity-85">
                    发音 {speakingResult.accuracy} · 流利度 {speakingResult.fluency} · 完整度{" "}
                    {speakingResult.completeness}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-outline !py-2 !text-xs !border-white/30 !text-white hover:!bg-white/10"
                    onClick={reRecord}
                  >
                    再练一次
                  </button>
                  <button className="btn-primary !py-2 !text-xs" onClick={handleNextSubtitle}>
                    下一句
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quiz block */}
          {quizQuestions.length > 0 && (
            <div className="quiz">
              <h3 className="!text-[15px] !font-bold !m-0 !mb-3.5">理解测验 · 填空</h3>
              {quizSubmitted && quizScore !== null ? (
                <div className="text-center py-6">
                  <div
                    className={cn(
                      "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
                      quizScore >= 60 ? "bg-success-soft" : "bg-brand-50"
                    )}
                  >
                    <span
                      className={cn(
                        "text-2xl font-bold",
                        quizScore >= 60 ? "text-success" : "text-brand-500"
                      )}
                    >
                      {quizScore}%
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-ink">
                    {quizScore >= 60 ? "太棒了！" : "继续加油！"}
                  </p>
                </div>
              ) : (
                <>
                  {quizQuestions.map((q, qi) => (
                    <div key={qi} className="mb-4">
                      <p className="text-[14px] font-semibold mb-2.5">
                        {qi + 1}. {q.question}
                      </p>
                      {q.type === "comprehension" && q.options ? (
                        <div>
                          {q.options.map((opt, oi) => (
                            <label
                              key={oi}
                              className={cn("q-opt", quizAnswers[qi] === opt && "q-opt-selected")}
                              onClick={() => handleQuizAnswer(qi, opt)}
                            >
                              <input
                                type="radio"
                                name={`q-${qi}`}
                                value={opt}
                                checked={quizAnswers[qi] === opt}
                                onChange={() => handleQuizAnswer(qi, opt)}
                                className="sr-only"
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      ) : q.type === "fill_blank" ? (
                        <input
                          type="text"
                          placeholder="输入答案..."
                          value={quizAnswers[qi] || ""}
                          onChange={(e) => handleQuizAnswer(qi, e.target.value)}
                          className="input-field mt-1"
                        />
                      ) : (
                        <textarea
                          placeholder="写出你听到的内容..."
                          value={quizAnswers[qi] || ""}
                          onChange={(e) => handleQuizAnswer(qi, e.target.value)}
                          rows={2}
                          className="input-field mt-1"
                        />
                      )}
                    </div>
                  ))}
                  <button
                    onClick={submitQuiz}
                    disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                    className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    提交答案
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div>
          {/* Learning mode / subtitle panel — sticky card */}
          <div className="bg-canvas border border-hairline rounded-lg p-[18px] lg:sticky lg:top-[88px]">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-sm font-bold">学习模式</span>
              <SubtitleModeTabs />
            </div>
            <div className="min-h-[380px] max-h-[560px] overflow-y-auto subtitle-scroll">
              {subtitleMode === "bilingual" ||
              subtitleMode === "english" ||
              subtitleMode === "chinese" ? (
                <div className="flex flex-col gap-0.5">
                  {video.subtitles.map((sub, i) => (
                    <div
                      key={sub.id}
                      id={`subtitle-${i}`}
                      onClick={() => {
                        setCurrentSubtitleIndex(i);
                        seekTo(sub.start_time);
                      }}
                      className={cn(
                        "p-3 rounded-sm text-sm leading-relaxed border-l-[3px] border-transparent cursor-pointer transition-colors duration-100 hover:bg-surface-soft",
                        i === currentSubtitleIndex && "bg-brand-50 border-l-brand-500"
                      )}
                    >
                      {subtitleMode !== "chinese" && (
                        <div
                          className={cn(
                            "font-medium",
                            i === currentSubtitleIndex ? "text-brand-500" : "text-ink"
                          )}
                        >
                          {sub.text_en}
                        </div>
                      )}
                      {(subtitleMode === "bilingual" || subtitleMode === "chinese") &&
                        sub.text_zh && (
                          <div className="text-muted text-xs mt-0.5">{sub.text_zh}</div>
                        )}
                    </div>
                  ))}
                </div>
              ) : subtitleMode === "reading" ? (
                <ReadingMode
                  subtitles={video.subtitles}
                  selectedWord={selectedWord}
                  onWordClick={handleWordClick}
                />
              ) : subtitleMode === "dictation" ? (
                <DictationMode subtitles={video.subtitles} />
              ) : subtitleMode === "fillblank" ? (
                <FillBlankMode subtitles={video.subtitles} />
              ) : subtitleMode === "translate" ? (
                <TranslateMode subtitles={video.subtitles} />
              ) : subtitleMode === "flashcard" ? (
                <FlashcardMode subtitles={video.subtitles} />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Word tooltip overlay */}
      {selectedWord && (
        <WordTooltipInline
          word={selectedWord}
          meaning={wordMeaning}
          onClose={clearWord}
          onPronounce={() => speakWord(selectedWord)}
          onSave={saveToVocabulary}
        />
      )}
    </div>
  );
}

/** Inline word tooltip — replaces the old WordTooltip overlay */
function WordTooltipInline({
  word,
  meaning,
  onClose,
  onPronounce,
  onSave,
}: {
  word: string;
  meaning: string | null;
  onClose: () => void;
  onPronounce: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-canvas border border-hairline rounded-lg shadow-lift p-4 max-w-sm w-[90%]">
      <div className="flex items-start justify-between mb-2">
        <span className="text-base font-bold text-ink">{word}</span>
        <button
          onClick={onClose}
          className="text-muted hover:text-ink transition-colors"
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
      {meaning ? (
        <p className="text-sm text-muted leading-relaxed mb-3">{meaning}</p>
      ) : (
        <p className="text-sm text-muted mb-3">查询中...</p>
      )}
      <div className="flex gap-2">
        <button onClick={onPronounce} className="btn-outline !py-1.5 !text-xs">
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
        </button>
        <button onClick={onSave} className="btn-primary !py-1.5 !text-xs">
          <Bookmark size={14} /> 加入词汇本
        </button>
      </div>
    </div>
  );
}
