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
import { useVideoPlayer, bestVideoUrl, youtubeId, PLAYBACK_RATES } from "@/hooks/useVideoPlayer";
import { useWordLookup } from "@/hooks/useWordLookup";
import { useVideoMeta } from "@/hooks/useVideoMeta";
import { api, mediaUrl } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { track, trackWatchTime } from "@/lib/analytics";
import { findSubtitleIndex } from "@/lib/subtitles";
import { resolveWatchReturn } from "@/lib/watchEntry";
import { SCROLL_CONTAINER_ID } from "@/lib/scrollMemory";
import type { VideoWithSubtitles, VocabSet, VocabSetCreateResponse } from "@/types";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import SubtitleModeTabs, { SubtitleModeRail } from "@/components/subtitle/SubtitleModeTabs";
import { WordTooltipInline } from "@/components/subtitle/WordTooltipInline";
import { WordCardSheet } from "@/components/watch/WordCardSheet";
import { ShadowingDrawer } from "@/components/watch/ShadowingDrawer";
import { ExamLevelSelector } from "@/components/watch/ExamLevelSelector";
import { VideoControls, type SubtitleFontSize } from "@/components/watch/VideoControls";
import { CurrentSentenceCard } from "@/components/watch/CurrentSentenceCard";
import { WatchMoreSheet } from "@/components/watch/WatchMoreSheet";
import { useWatchChrome, type WatchChromeState } from "@/components/watch/WatchChromeProvider";
import { AudioWaveform } from "@/components/speaking/AudioWaveform";
import { WaveformCompare } from "@/components/speaking/WaveformCompare";
import { ShadowingHistory } from "@/components/watch/ShadowingHistory";
import { shouldDisplay, wordHighlightClass, cleanToken } from "@/lib/examLevels";
import { cefrWithExamHint } from "@/lib/cefrLevels";
import {
  ArrowLeft,
  Loader2,
  Play,
  Mic,
  Bookmark,
  Heart,
  BookOpen,
  GraduationCap,
  Pencil,
  X,
  AlertCircle,
  Check,
  ChevronRight,
  Layers,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import { STEP_LABELS } from "@/lib/videoStatus";
import { Card } from "@/components/ui/Card";

// D1：字幕字号档位 → 像素的映射已随当前句卡搬到
// `components/watch/CurrentSentenceCard.tsx`（当前句现在只有那一份渲染）。

/**
 * 返回出口：带上 `?from=` 标记就回来源页，回到那个页面的 URL 状态；
 * 没有标记（旧链接、外部直达）才退化为浏览器后退。
 * 一律用 `replace`：`push` 会造出「首页 → 播放页 → 首页 → 后退 → 播放页」的历史环。
 */
function useWatchReturn(): { label: string; go: () => void } {
  const router = useRouter();
  const searchParams = useSearchParams();

  return useMemo(() => {
    const target = resolveWatchReturn(searchParams);
    if (target) {
      return { label: target.label, go: () => router.replace(target.href) };
    }
    return {
      label: "返回",
      go: () => {
        if (window.history.length > 1) router.back();
        else router.replace("/");
      },
    };
  }, [router, searchParams]);
}

/**
 * 视频的动作行（点赞 / 收藏 / 加入学习 / 单词训练 / 笔记）。
 *
 * 抽出来是因为移动端要换位置：#24/#28 乙把首屏全给画面，页头那 102px 不能留在
 * 播放器上方（原型 B2-tap 实测画框顶 y=44＝壳顶，app 曾是 y=166）。移动端这一行
 * 落到字幕卡下面，桌面端仍在页头原位。
 */
function VideoActions({
  compact,
  isLiked,
  likeCount,
  isFavorited,
  vocabSet,
  addingVocabSet,
  noteOpen,
  onToggleLike,
  onToggleFavorite,
  onVocabSet,
  onNotes,
  onDrill,
}: {
  compact: boolean;
  isLiked: boolean;
  likeCount: number;
  isFavorited: boolean;
  vocabSet: VocabSet | null;
  addingVocabSet: boolean;
  noteOpen: boolean;
  onToggleLike: () => void;
  onToggleFavorite: () => void;
  onVocabSet: () => void;
  onNotes: () => void;
  onDrill: () => void;
}) {
  // 移动端一律 44px 触控目标（#24/#28 的触控基线），桌面端维持原有的 36px 紧凑档。
  const box = compact ? "w-11 h-11" : "w-9 h-9";
  return (
    <div className={cn("flex items-center", compact ? "gap-1" : "gap-1 shrink-0")}>
      <button
        className={cn(
          box,
          "px-2 rounded-lg flex items-center gap-1 text-muted hover:bg-surface-card hover:text-ink transition-colors cursor-pointer",
          !compact && "h-9 w-auto"
        )}
        onClick={onToggleLike}
        aria-label={isLiked ? `取消点赞（${likeCount}）` : `点赞（${likeCount}）`}
        title={isLiked ? "取消点赞" : "点赞"}
      >
        <Heart size={18} className={cn(isLiked && "fill-current text-error")} />
        {!compact && (
          <span
            className={cn(
              "text-meta font-semibold tabular-nums",
              isLiked ? "text-error" : "text-muted"
            )}
          >
            {likeCount > 0 ? likeCount : "点赞"}
          </span>
        )}
      </button>
      <button
        className={cn(
          box,
          "rounded-lg flex items-center justify-center text-muted hover:bg-surface-card hover:text-ink transition-colors cursor-pointer"
        )}
        onClick={onToggleFavorite}
        aria-label={isFavorited ? "取消收藏" : "收藏视频"}
        title={isFavorited ? "取消收藏" : "收藏"}
      >
        <Bookmark size={18} className={cn(isFavorited && "fill-current text-brand-500")} />
      </button>
      <button
        className={cn(
          box,
          "rounded-lg flex items-center justify-center transition-colors cursor-pointer",
          vocabSet ? "text-brand-500" : "text-muted hover:bg-surface-card hover:text-ink"
        )}
        onClick={onVocabSet}
        aria-label={vocabSet ? "已加入学习，查看词汇集合" : "把本视频单词加入学习"}
        title={vocabSet ? "已加入学习" : "加入学习"}
        disabled={addingVocabSet}
      >
        {addingVocabSet ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <GraduationCap size={18} className={cn(vocabSet && "fill-current")} />
        )}
      </button>
      <button
        className={cn(
          box,
          "rounded-lg flex items-center justify-center text-muted hover:bg-surface-card hover:text-ink transition-colors cursor-pointer"
        )}
        onClick={onDrill}
        aria-label="单词训练"
        title="单词训练"
      >
        <BookOpen size={18} />
      </button>
      <button
        className={cn(
          box,
          "rounded-lg flex items-center justify-center transition-colors cursor-pointer",
          noteOpen
            ? "bg-brand-50 text-brand-500"
            : "text-muted hover:bg-surface-card hover:text-ink"
        )}
        onClick={onNotes}
        aria-label="笔记"
        title="笔记"
      >
        <Pencil size={18} />
      </button>
    </div>
  );
}

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
  const { uploadAndSave, uploading, attempts, deleteAttempt, setSatisfied } = useShadowing(id);
  const [shadowingSaved, setShadowingSaved] = useState(false);
  const [shadowingSatisfied, setShadowingSatisfied] = useState(false);
  // 当前句已上传录音的 attempt id —— 「满意」按钮靠它 PATCH 持久化。
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  // ⋯ 面板（DEC-069 / #31）：来源/版权/语言/字号/倍速/动作行全收进这里，首屏那 355px
  // 次要信息归零。面板由页面渲染（在滚动容器里），开关状态经壳顶栏的 ⋯ 来回。
  const [moreOpen, setMoreOpen] = useState(false);
  // #26 乙：移动端练习区搬进底部抽屉；桌面端仍在字幕卡里就地展开（本轮不动桌面）。
  const [practiceOpen, setPracticeOpen] = useState(false);

  // D13: deep link from /favorites with ?note=1 opens the note drawer
  // immediately so the user lands on their saved note.
  const searchParams = useSearchParams();
  const back = useWatchReturn();
  useEffect(() => {
    if (searchParams.get("note") === "1") setNoteOpen(true);
  }, [searchParams]);

  // Auto-upload recording when entering reviewing state
  useEffect(() => {
    if (speakingState === "reviewing" && audioBlob && !shadowingSaved) {
      setShadowingSaved(true); // prevent double-upload
      setLastAttemptId(null);
      uploadAndSave(audioBlob, {
        videoId: id,
        subtitleId: video?.subtitles?.[currentSubtitleIndex]?.id ?? null,
        // D10: 上报录音时长，后端按秒累计进 LearningEvent。
        durationMs: seconds > 0 ? seconds * 1000 : null,
        isSatisfied: false,
      }).then((attempt) => {
        if (attempt) setLastAttemptId(attempt.id);
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
    currentSubtitleIndex,
    setCurrentSubtitleIndex,
    videoRef,
    ytContainerRef,
    isYtMode,
    isPlaying,
    play,
    togglePlayPause,
    navigateSubtitle,
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
    setLastAttemptId(null);
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

  // #26 乙：练习流程一开就把抽屉推上来。桌面端抽屉不渲染，这个状态只是空转。
  useEffect(() => {
    if (speakingActive || sentenceShadow.active) setPracticeOpen(true);
  }, [speakingActive, sentenceShadow.active]);

  /** 关抽屉 = 退出练习：逐句模式退出、麦克风释放，高亮留在刚才练的那一句（#26 决议④）。 */
  function closePractice() {
    setPracticeOpen(false);
    if (sentenceShadow.active) sentenceShadow.exit();
    if (speakingActive) stopSpeaking();
  }

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

  // 字幕跟随（DEC-073）分成两条路：
  //   · 桌面：只滚右侧内层字幕列表、把当前句居中，**绝不触碰整页 <main>**
  //     （用 scrollIntoView 会连带 <main> 一起拽回顶部，停在底部练习区时页面被拽走白屏）。
  //   · 移动端：文稿已是页级滚动（卡内不再有 max-h / 内部滚动条），跟随就把壳滚动容器
  //     `main#main-scroll` 滚到「当前句条目顶边 = 画框下沿 + 8px」，且**只在画框已贴顶常驻
  //     时**才跟 —— 页面还在顶部时画框与字幕带都在视野里，没有任何理由把页面拽走。
  //     用户手动滚一下（touch/wheel）即暂停跟随，等下一次句子导航（上一句/下一句/点文稿行）
  //     才恢复；否则播放中的每一句都会把用户刚滚到的位置抢回去。
  const subtitleListRef = useRef<HTMLDivElement>(null);
  // #30 决议：移动端滚过画框之后，画面**贴顶常驻**（不是缩成右下角小窗）。
  // 桌面端保持常规流里的 sticky 版式。
  const slotRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const followPausedRef = useRef(false);
  /** 显式句导航（上一句/下一句/点文稿行/深链落点）会恢复跟随。 */
  const resumeFollow = useCallback(() => {
    followPausedRef.current = false;
  }, []);
  // #30：移动端滚过画框之后画面贴顶常驻；DEC-069 之后钉住位置从壳顶变成**顶栏下沿**
  // （`main` 上沿，顶栏是 main 之上的常规流行）。`dismiss` 已随画面内的退出 X 一起删除
  // —— 退出跟随 = 滚回顶部（`useStickyPip` 的 `!out → setDismissed(false)` 本来就这么做）。
  const { isStuck } = useStickyPip(slotRef, isMobile && playbackMode === "ready");
  // 手动滚动 = 暂停跟随。只监听用户输入事件，程序自己的 scrollBy 不会触发这两个。
  useEffect(() => {
    if (!isMobile) return;
    const scroller = document.getElementById(SCROLL_CONTAINER_ID);
    if (!scroller) return;
    const pauseFollow = () => {
      followPausedRef.current = true;
    };
    scroller.addEventListener("touchstart", pauseFollow, { passive: true });
    scroller.addEventListener("wheel", pauseFollow, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", pauseFollow);
      scroller.removeEventListener("wheel", pauseFollow);
    };
  }, [isMobile]);
  useEffect(() => {
    const el = document.getElementById(`subtitle-${currentSubtitleIndex}`);
    if (!el) return;
    if (isMobile) {
      const scroller = document.getElementById(SCROLL_CONTAINER_ID);
      const frame = slotRef.current;
      if (!scroller || !frame || !isStuck || followPausedRef.current) return;
      const delta = el.getBoundingClientRect().top - (frame.getBoundingClientRect().bottom + 8);
      // 只在本句偏离目标位置超过一行时才滚，避免每次 timeUpdate 都抖动。
      if (Math.abs(delta) > 24) scroller.scrollBy({ top: delta, behavior: "smooth" });
      return;
    }
    const container = subtitleListRef.current;
    if (!container) return;
    const elTop = el.getBoundingClientRect().top;
    const cTop = container.getBoundingClientRect().top;
    const offset = elTop - cTop - (container.clientHeight / 2 - el.clientHeight / 2);
    // 仅当目标句偏离容器中心超过半句高时才滚，避免每次 timeUpdate 都抖动
    if (Math.abs(offset) > el.clientHeight / 2) {
      container.scrollBy({ top: offset, behavior: "smooth" });
    }
  }, [currentSubtitleIndex, isMobile, isStuck]);

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

  // D3b/S7b: deep-link focus — ?sub=<subtitle id> lands on one sentence
  // (「回到对应句子」/「回看原句」), ?word= highlights that word too, legacy ?t=
  // stays as a pure seek. `sub` wins over `t`: the sentence id is stable,
  // seconds drift with re-transcription. Runs once the player is ready and
  // re-applies only when the params themselves change.
  const deepLinkAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (playbackMode !== "ready" || !video || !videoRef.current) return;
    const sub = searchParams.get("sub");
    const word = searchParams.get("word");
    const t = searchParams.get("t");
    if (!sub && !word && !t) return;
    const signature = `${sub ?? ""}|${word ?? ""}|${t ?? ""}`;
    if (deepLinkAppliedRef.current === signature) return;
    deepLinkAppliedRef.current = signature;

    const subs = video.subtitles ?? [];
    let seconds: number | null = null;
    if (sub) {
      const idx = subs.findIndex((s) => s.id === sub);
      if (idx !== -1) {
        resumeFollow(); // 深链落点算一次显式导航：把跟随拉回来
        setCurrentSubtitleIndex(idx); // 句高亮 + 字幕跟随联动
        seconds = subs[idx].start_time;
      }
    }
    if (seconds === null && t) {
      const parsed = parseFloat(t);
      if (!Number.isNaN(parsed) && parsed >= 0) seconds = parsed;
    }
    if (seconds !== null) videoRef.current.currentTime = seconds;
    if (word) handleWordClick(word); // 词高亮（字幕列表 selectedWord 联动）+ 词卡
    // videoRef is a stable ref; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackMode, video, searchParams]);

  const subtitleMode = useWatchStore((s) => s.subtitleMode);
  const setSubtitleMode = useWatchStore((s) => s.setSubtitleMode);
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

  // DEC-073：高亮四档里的「已掌握」那一档要单独一次查询 —— 同一个端点按 mastery 过滤、
  // 只回词串，learning/reviewing 与 mastered 必须能区分开才谈得上降底色。
  const [masteredWords, setMasteredWords] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ words: string[] }>("/api/v1/vocabulary/words?mastery=mastered");
        if (!cancelled) setMasteredWords(new Set(res.words));
      } catch {
        // non-fatal: 拿不到已掌握词表就退化成「未掌握」那一档，只是底色略多，不挡播放。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // 词汇集合：本视频是否已生成过筛集合（GET /vocab-sets 按 video_id 匹配）。
  // 已加入 → 图标点亮并跳转集合页；未加入 → POST 创建并 toast 服务端 message。
  const [vocabSet, setVocabSet] = useState<VocabSet | null>(null);
  const [addingVocabSet, setAddingVocabSet] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const sets = await api<VocabSet[]>("/api/v1/vocab-sets");
        if (!cancelled) setVocabSet(sets.find((s) => s.video_id === id) ?? null);
      } catch {
        // non-fatal: 按钮保持「加入学习」态
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, id]);

  async function handleVocabSetClick() {
    if (!requireAuth()) return;
    if (vocabSet) {
      router.push(`/vocabulary/sets/${vocabSet.id}`);
      return;
    }
    if (addingVocabSet) return;
    setAddingVocabSet(true);
    try {
      const res = await api<VocabSetCreateResponse>("/api/v1/vocab-sets", {
        method: "POST",
        body: JSON.stringify({
          video_id: id,
          ...(selectedExamLevel ? { exam_level: selectedExamLevel } : {}),
        }),
      });
      toast.success(res.message || "已加入学习");
      setVocabSet({
        id: res.id,
        video_id: res.video_id,
        exam_level: res.exam_level,
        title: video?.title ?? "",
        thumbnail_url: video?.thumbnail_url ?? null,
        total: res.total,
        mastered_count: 0,
        last_activity_at: null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "加入失败，请重试"));
    } finally {
      setAddingVocabSet(false);
    }
  }

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
      setLastAttemptId(null);
      resumeFollow(); // 显式「下一句」= 恢复跟随
      setCurrentSubtitleIndex(currentSubtitleIndex + 1);
      seekTo(next.start_time);
    }
  }

  // onNext 必须与 onPrev 对称：store 里只放**稳定引用**，闭包经 ref 镜像读最新状态。
  // （第一版把 handleNextSubtitle 直接塞进 store：它闭包里的 currentSubtitleIndex 冻结在
  //  memo 上次重算的那一刻，实测「下一句」会往回跳，然后彻底不动。见 INV-025。）
  const nextRef = useRef(handleNextSubtitle);
  useEffect(() => {
    nextRef.current = handleNextSubtitle;
  });
  const onNextStable = useCallback(() => nextRef.current(), []);

  /** 重录：除录音钩子自身重置外，同步清掉上传/满意标记 ——
   * 否则重录后的新录音因 shadowingSaved 仍为 true 而永不上传。 */
  function handleReRecord() {
    reRecord();
    setShadowingSaved(false);
    setShadowingSatisfied(false);
    setLastAttemptId(null);
  }

  /** 「满意」：本地立即翻转 + PATCH 持久化（失败时 hook 内部回滚并提示）。 */
  function handleToggleSatisfied() {
    const next = !shadowingSatisfied;
    setShadowingSatisfied(next);
    if (lastAttemptId) void setSatisfied(lastAttemptId, next);
  }

  /** Play the original audio by seeking the video to the current subtitle. */
  function playOriginal() {
    const sub = video?.subtitles?.[currentSubtitleIndex];
    if (!sub) return;
    seekTo(sub.start_time);
    play();
  }

  // 考试词高亮 —— DEC-073 的四档，从强到弱：
  //   ① learning/reviewing（正在学）→ 品牌实底 + 实线（Sprint 3 语义不变，最强档）
  //   ② 未收录、且命中目标级别 → 极浅底 + 虚线（`wordHighlightClass` 的 soft 档）
  //   ③ 已掌握 → 只留虚线下划线，不给底色
  //   ④ 其余 → 无样式
  // `shouldDisplay` 的「目标级别及以上」语义**不变**，本轮只降视觉重量：一屏十来处底色把
  // 英文正文的连续阅读打断，也让「当前句」的橙色锚点被稀释。
  function levelClassFor(word: string, wordLevels: Record<string, string[]> | null): string {
    const token = cleanToken(word);
    if (vocabWords.has(token)) {
      return "bg-brand-100 text-brand-700 underline decoration-brand-400 decoration-2 underline-offset-2 rounded-md px-0.5";
    }
    if (!wordLevels || !selectedExamLevel) return "";
    const levels = wordLevels[token];
    if (!levels || !shouldDisplay(levels, selectedExamLevel)) return "";
    // 已掌握的词只留形状（虚线下划线），不再吃底色。
    if (masteredWords.has(token)) {
      return wordHighlightClass(levels, selectedExamLevel, { only: true });
    }
    // 目标分级优先取色：词属于所选分级时用该分级颜色（如选四级 → 蓝色），
    // 否则回退词自身的最高分级颜色。见 lib/examLevels.ts displayLevel。
    return wordHighlightClass(levels, selectedExamLevel);
  }

  function isSelectedWord(word: string): boolean {
    if (!selectedWord) return false;
    return selectedWord === cleanToken(word);
  }

  // ---- 页面 → 壳：顶栏内容 + 底栏句柄（DEC-069 / #31）----------------------------
  // **必须放在下面那些 early return 之前**：hook 一旦在某个分支被跳过，React 直接抛
  // 「Rendered fewer hooks than expected」并把整棵页面树卸载 —— 实测表现是只剩壳、
  // 页面内容整块消失（这个坑真踩过）。
  //
  // 只放**低频**事实：`currentTime` 每秒跳 4 次，进 store 会让整个壳每秒重渲染 4 次。
  // 进度条由 `WatchBottomBar` 自己 rAF 直读 `videoRef`（见该文件顶部注释）。
  // 上一句没有现成的页面函数，直接用 hook 的 `navigateSubtitle(-1)`（桌面端本来就有）。
  const chromeTimer = useCallback(() => setMoreOpen((v) => !v), []);
  // `<video>` 的 ref 落点：`videoRef` 与底栏共用同一个元素，但底栏还需要「元素接上了」这次
  // 通知（`aria-valuemax` 必须重渲染才能改）。写法与 `nextRef` 同理 —— 把这次通知变成一次
  // **低频** state 变化（只在挂载/卸载时），而不是让整个壳跟着每次渲染重算（INV-025）。
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    // `useVideoPlayer` 的 ref 声明成 `RefObject<HTMLVideoElement>`（`useRef(null!)`）；
    // 元素卸载时 React 会用 null 调回调 ref，所以这里按可空写入 —— 与它的初值同性质。
    videoRef.current = el as HTMLVideoElement;
    setVideoEl(el);
    // videoRef 是 useRef 的固定对象，故意不进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chromeShadowing = useCallback(() => {
    if (practiceOpen) closePractice();
    else setPracticeOpen(true);
    // closePractice 是每次渲染新建的普通函数，故意不进依赖（它只碰 ref 与稳定 setter）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceOpen]);

  const chrome: WatchChromeState = useMemo(
    () => ({
      title: video?.title ?? "",
      levelText: `${video?.channel_name || "SeeWord"} · ${cefrWithExamHint(
        video?.difficulty_level || "B2"
      )}`,
      levelSelector: (
        <ExamLevelSelector level={selectedExamLevel} onChange={handleExamLevelChange} />
      ),
      onBack: back.go,
      onMore: chromeTimer,
      moreOpen,
      videoRef,
      attachVideo,
      duration: video?.duration ?? null,
      isPlaying,
      onTogglePlay: togglePlayPause,
      // 显式「上一句」也算一次句导航：先恢复跟随，再走 hook 的上一句（顺序不能反 ——
      // `navigateSubtitle` 会同步改 `currentSubtitleIndex`，跟随 effect 就在那之后跑）。
      onPrev: () => {
        resumeFollow();
        navigateSubtitle(-1);
      },
      // onPrev 稳定（`navigateSubtitle` 是 useCallback + ref 读值），onNext 也必须稳定 ——
      // 见上面 `nextRef` / `onNextStable`。**别**把 `handleNextSubtitle` 或
      // `currentSubtitleIndex` 加进依赖表：那会让壳每句重渲染 4 次（INV-025）。
      onNext: onNextStable,
      sentenceNavDisabled: isYtMode,
      onShadowing: chromeShadowing,
      shadowingActive: practiceOpen,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      video,
      selectedExamLevel,
      back.go,
      chromeTimer,
      moreOpen,
      isPlaying,
      togglePlayPause,
      navigateSubtitle,
      resumeFollow,
      isYtMode,
      chromeShadowing,
      practiceOpen,
      onNextStable,
      attachVideo,
      // `attachVideo` 是稳定 useCallback；`videoEl` 只用来给「元素接上了」这次低频变化
      // 触发一次重算，它本身不参与 chrome 的值（所以上面对象里没引用它）。
      videoEl,
    ]
  );
  useWatchChrome(chrome);

  // --- Keyboard shortcuts: 页面层不再持有快捷键 —— D1 后统一由
  // useVideoPlayer 处理（空格/←→/↑↓音量/M/F/C/S）；「下一句」由录音展开态按钮承担。

  // --- Loading / Error states ---
  // 终态处理失败先于通用加载失败态：playbackMode === "error" 也会由处理中轮询到的
  // error 置位（见 useVideoPlayer），其通用文案会遮蔽这里的真实原因与 error_message。
  if (video?.status === "error")
    return (
      <ErrorState
        title="处理失败"
        message={video.error_message || "未知错误"}
        action={
          <button onClick={back.go} className="mt-4 text-copy text-brand-500 hover:underline">
            {back.label}
          </button>
        }
        fullPage
      />
    );

  if (!video && playbackMode !== "error") return <FullPageSpinner />;

  if (playbackMode === "error") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto text-muted mb-4" />
          <p className="text-ink">加载视频失败</p>
          <p className="mt-1 text-copy text-muted">请检查网络连接后重试</p>
          <Button onClick={retry} className="mt-4">
            重新加载
          </Button>
        </div>
      </main>
    );
  }

  if (!video) return <FullPageSpinner />;

  // 已下线（需求 §5.1 offline / §5.3）：媒体已释放，学习记录仍在。
  // 收藏夹与集合页「回看原视频」会落到这里，故给出明确说明与出口。
  if (playbackMode === "offline") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="text-center max-w-md px-4">
          <AlertCircle size={48} className="mx-auto text-muted mb-4" />
          <p className="text-copy-lg font-semibold text-ink">该视频已下架</p>
          <p className="mt-2 text-copy text-muted leading-relaxed">
            视频媒体已释放存储空间，不再提供播放。
            <br />
            你的学习记录（词库与视频集合）仍然保留，可以继续学习。
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={() => router.push("/vocabulary")}>去单词训练</Button>
            <Button variant="outline" onClick={back.go}>
              {back.label}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (playbackMode === "processing") {
    const stepLabel = video.processing_step
      ? (STEP_LABELS[video.processing_step] ?? "处理中...")
      : "处理中...";
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto animate-spin text-brand-500" />
          <p className="mt-4 text-ink">{stepLabel}</p>
          <p className="mt-1 text-copy text-muted">视频下载和转码需要几分钟，请稍候</p>
          {video.status === "ready_subtitles" && (
            <p className="mt-2 text-meta text-success">字幕已就绪，视频处理中...</p>
          )}
        </div>
      </main>
    );
  }

  const currentSubtitle = video.subtitles[currentSubtitleIndex];

  /**
   * 学习笔记面板。抽出来是因为它现在有两个落点（DEC-069 第 6 条把移动端的笔记入口
   * 收进了 ⋯ 面板）：桌面端仍在页头原位，移动端由 `WatchMoreSheet` 的 `extra` 渲染。
   */
  const notesPanel = noteOpen ? (
    <Card padding={4} className="mt-3 animate-fade-in">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-copy font-semibold">学习笔记</span>
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
    </Card>
  ) : null;

  return (
    // 自然流布局：顶部 header + 双列（视频/字幕）+ 下方练习区，整页自然滚动。
    // 容器由壳层提供（DEC-075：全站唯一容器在 MainLayoutInner 渲染一次），这里只留纵向留白。
    // 原先的 1280 封顶是为了宽屏不把视频列拉过头，那件事现在交给画框的高度护栏（.watch-stage-cap）。
    <div className="pt-6 pb-16">
      {/* 移动端页头整块不渲染（#24/#28 乙 → DEC-069）：标题/返回/级别进壳顶栏，
          动作行进 ⋯ 面板，首屏不再有这块 355px 的次要信息；桌面端原样保留。 */}
      <div className={cn("mb-4", isMobile && "hidden")}>
        {/* 顶部细行：返回 + 标题 + 操作图标 */}
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-1.5 text-copy font-semibold text-muted hover:text-ink transition-colors cursor-pointer shrink-0"
            onClick={back.go}
          >
            <ArrowLeft size={14} />
            {back.label}
          </button>
          <div className="h-4 w-px bg-hairline shrink-0" />
          <h1 className="text-copy-lg font-semibold text-ink truncate flex-1 min-w-0">
            {video.title}
          </h1>
          <VideoActions
            compact={false}
            isLiked={isLiked}
            likeCount={likeCount}
            isFavorited={isFavorited}
            vocabSet={vocabSet}
            addingVocabSet={addingVocabSet}
            noteOpen={noteOpen}
            onToggleLike={toggleLike}
            onToggleFavorite={toggleFavorite}
            onVocabSet={handleVocabSetClick}
            onNotes={() => setNoteOpen((v) => !v)}
            onDrill={() => router.push("/vocabulary")}
          />
        </div>

        {/* meta 细行：作者名链到作者页（ADR-0014 修订），未挂频道显示 SeeWord */}
        <div className="mt-2 flex items-center gap-2 text-meta text-muted">
          {video.channel_name ? (
            video.channel_slug ? (
              <Link
                href={`/channels/${video.channel_slug}`}
                className="inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-0.5 font-semibold text-ink hover:border-brand-500/40 hover:text-brand-500 transition-colors"
              >
                {video.channel_name}
                <ChevronRight size={12} />
              </Link>
            ) : (
              <span className="font-semibold text-ink">{video.channel_name}</span>
            )
          ) : (
            <span className="font-semibold text-ink">SeeWord</span>
          )}
          <span>·</span>
          {/* CEFR 附考试体系对照，与引导/筛选统一语言 */}
          <span>{cefrWithExamHint(video.difficulty_level || "B2")}</span>
          <span>·</span>
          <span>{formatDuration(video.duration)}</span>
        </div>

        {/* 笔记抽屉 */}
        {notesPanel}
      </div>

      {/* ===== 双列：左视频+字幕+录音，右字幕面板（可折叠） ===== */}
      <div
        className={cn(
          "grid grid-cols-1 items-start transition-[grid-template-columns] duration-200",
          // #30：移动端左列用 `display: contents` 消掉自己的盒子（见下），
          // 画框因此成为 grid item —— 列内间距由各自 margin 负责，这里不能再叠 gap。
          isMobile ? "gap-0" : "gap-5",
          // S4：展开态右栏不再是 1fr —— S2 放宽容器后它在宽屏被拉成 600px+。
          // 固定区间 360–420：下界低于 360 会让 1024–1700 主流宽度上右栏反而变窄
          // （1280 屏实测 401 → 写 320 就是 320），字幕行换行更多。折叠态不动。
          panelCollapsed
            ? "lg:grid-cols-[1fr_56px]"
            : "lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]"
        )}
      >
        {/* ========== LEFT COLUMN ========== */}
        {/* #30 贴顶常驻挂在这一层，但**移动端这一层不产生盒子**（`display: contents`）：
            它的子元素直接成为 grid item，于是被粘的是**画框自己** —— 这正是原型
            `S-scroll.html` 里 `.player{position: sticky}` 的语义，包含块也从「490px 高的列」
            变成「整个网格容器」（≈1170px）。
            两处代价都是实测出来的，别再改回去：
              · 粘在**列**上（前一版）：包含块只有列那么高，余量 635px < 滚动上限 727px ——
                页面最后 92px 里画面被包含块底边推着走（实测滚到上限时画框顶 y=-28，
                壳顶是 64）；而且把列里的字幕卡/行动行/来源卡一起钉住 490px，
                703px 可视高只剩 189px 给文稿；列自身没有背景，缝隙还透出下面滑过的文稿。
              · 粘在**内层 absolute div** 上：父级只有 490px 且 `items-start` 不拉伸，
                元素跟着一起滚走（实测滚 600px 时画框顶 y=-232.8，等于没粘）。
            `top-0`：画框的 `-mt-6` 已经把它拎到壳顶（INV-024 实测 y=64），贴顶位就是滚动容器上沿。 */}
        <div className={cn(isMobile ? "contents" : "min-w-0")}>
          {/* S4 高度护栏：桌面端把「画框 + 当前句卡」包进 .watch-stage-cap
              （夹宽 → 16:9 联动夹高 → 句卡留在首屏）；移动端这层 `contents` 消盒，
              画框仍是 grid item，出血与贴顶几何零变化。只包这两件 —— 桌面字幕卡
              （下方 mt-3 那张）不在护栏内，S5 会把它整体搬进句卡。 */}
          <div className={cn(isMobile ? "contents" : "watch-stage-cap")}>
            {/* Video player —— 宽高比驱动（不依赖父级高度链，避免塌缩黑屏）。
              `<video>` 节点不换父，所以内联 ↔ 贴顶常驻切换不丢播放进度。
              移动端**出血满宽 + 顶到壳顶**（#24/#28 乙，原型 B2-tap 实测：画框 x=0
              w=375 顶部 y=壳顶高）：-mx-4/-mt-6 抵消容器的 px-4/pt-6，桌面端不加。 */}
            <div
              ref={slotRef}
              data-testid="video-frame"
              className={cn(
                "relative aspect-video bg-surface-dark overflow-hidden shadow-lift",
                // 移动端出血：w-full 是按列宽（343）算的，负外边距只挪位置不改宽，
                // 所以宽度必须显式给 w-screen（= 视口宽）才对上原型的 375×210.9。
                isMobile ? "w-screen rounded-none -mx-4 sm:-mx-7" : "w-full rounded-lg",
                isMobile && !noteOpen && "-mt-6",
                // #30：滚过之后**画框自己**贴顶常驻（不缩、不飞、不消失）。
                // 它是 grid item（左列在移动端 `display: contents`），包含块是整个网格容器。
                // DEC-069：钉住位置 = `main#main-scroll` 的上沿 = 观看页 44px 顶栏的下沿。
                // DEC-073：贴顶时补一条下边线 —— 文稿文字是从画框下沿**穿过**去的，
                // 没有这条边，被遮住的那半行字读起来就像"被切掉了"（真机截图实测）。
                isMobile && isStuck && "sticky top-0 z-40 border-b border-hairline"
              )}
            >
              <div
                ref={(el) => {
                  // D1：F 全屏的目标容器（播放器外壳）。
                  fullscreenElRef.current = el;
                }}
                className="absolute inset-0 transition-all duration-300"
              >
                {playbackMode === "ready" && bestVideoUrl(video) ? (
                  <>
                    <video
                      ref={chrome.attachVideo ?? videoRef}
                      // iOS Safari 对无 playsinline 的 <video> 会强制系统全屏播放，
                      // 页面字幕被遮盖；必须内联播放才能字幕/视频同屏。
                      playsInline
                      webkit-playsinline="true"
                      x5-playsinline="true"
                      src={mediaUrl(bestVideoUrl(video)!, {
                        // /media 需要可识别的观看者，<video> 无法带 Authorization
                        // 头，统一用 ?token= 携带。
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
                    {/* DEC-069：画面内**零覆盖物** —— 标题/返回键/退出 X/级别药丸/入画字幕
                      全部搬走（标题与返回进壳顶栏、级别进壳顶栏、字幕进画面正下方的当前句卡）。
                      桌面端只有 D1 控制条这一层，移动端连它也不在画面里（底栏接管）。 */}
                    {!isMobile && (
                      <VideoControls
                        videoRef={videoRef}
                        isPlaying={isPlaying}
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
                        markers={shadowMarkers}
                      />
                    )}
                    {/* D3b EndScreen — only when the <video> has fired onEnded. */}
                    {ended && video?.id && (
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
                  <div ref={ytContainerRef} className="h-full w-full" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="text-center">
                      <Play size={40} className="mx-auto text-white/30" />
                      <p className="mt-3 text-copy text-white/40">视频未就绪</p>
                    </div>
                  </div>
                )}
              </div>
              {/* DEC-069：级别药丸搬进壳顶栏（移动端）；画面里不再有任何可点覆盖物 */}
            </div>

            {/* 当前句卡：**画面正下方**，移动端与桌面端唯一的一份当前句（INV-021）。
              点词 → 词卡；点卡片空白 → 播放/暂停。S5 起桌面端的跟读动作带也住进卡内
              （`desktopActions`，移动端不传——移动端跟读仍在底栏/抽屉）。
              R5「齐平字幕带」（DEC-070）：≤1023px 卡顶 = 画框下沿（`mt-0`，0 断层）、无外框
              （`border-0`）、无圆角，于是「画框下沿」成为这一段唯一的边；桌面端一个字不改
              （仍是 12px + 圆角 + 边框）。twMerge 里后写的工具类覆盖 `CurrentSentenceCard`
              基类的 `mt-3 / border / rounded-lg`。 */}
            {currentSubtitle && (
              <CurrentSentenceCard
                // DEC-074：移动端是齐平字幕带（无外框、计数与展开开关进元信息行），
                // 桌面端仍是卡片（12px 间距 + 圆角 + 边框、计数在右上角）。
                variant={isMobile ? "band" : "card"}
                // 移动端与画框同一个槽位、同一条左右边界（画框 `-mx-4 sm:-mx-7` 出血满宽，
                // 卡跟着出血；桌面端两者都留在容器内）。
                className={cn(isMobile && "-mx-4 sm:-mx-7 mt-0 rounded-none border-0")}
                textEn={currentSubtitle.text_en}
                textZh={currentSubtitle.text_zh ?? null}
                wordLevels={currentSubtitle.word_levels ?? null}
                subtitleMode={subtitleMode}
                fontSize={subtitleFontSize}
                isSelected={isSelectedWord}
                levelClassFor={levelClassFor}
                onWordClick={handleWordClick}
                onTogglePlay={togglePlayPause}
                counter={`${currentSubtitleIndex + 1} / ${video.subtitles.length}`}
                desktopActions={
                  isMobile ? undefined : (
                    <>
                      {/* S5：桌面动作带——原来「画面下的第二张卡」整块搬进句卡自身。
                          `isMobile ? undefined` 保证移动端**不传**、DOM 零变化
                          （`hidden lg:flex` 是第二条保险）。状态与回调逐字沿用原卡。 */}

                      {/* 动作带：整宽 2 段（TabPills 视觉语言）。逐句跟读与手动录音
                          互斥：进逐句前若手动录音在跑，先收掉（同一支麦克风）。 */}
                      <div
                        data-coach="practice"
                        className="grid grid-cols-2 gap-1 rounded-pill bg-surface-card p-1"
                      >
                        <button
                          className={cn(
                            "inline-flex items-center justify-center gap-1.5 rounded-pill px-3 py-2 text-copy font-semibold transition-colors duration-150 cursor-pointer",
                            sentenceShadow.active
                              ? "bg-success text-white"
                              : "text-muted hover:text-ink",
                            isYtMode && "opacity-50 cursor-not-allowed hover:text-muted"
                          )}
                          onClick={() => {
                            if (isYtMode) return;
                            if (sentenceShadow.active) {
                              sentenceShadow.exit();
                            } else {
                              if (speakingActive) stopSpeaking();
                              sentenceShadow.start();
                            }
                          }}
                          disabled={isYtMode}
                          title={
                            isYtMode ? "YouTube 视频暂不支持逐句跟读" : "播一句自动录音，逐句循环"
                          }
                          aria-label={sentenceShadow.active ? "退出逐句跟读" : "开始逐句跟读"}
                        >
                          <Repeat size={15} />
                          {sentenceShadow.active ? "退出逐句" : "逐句跟读"}
                        </button>

                        <button
                          className={cn(
                            "inline-flex items-center justify-center gap-1.5 rounded-pill px-3 py-2 text-copy font-semibold transition-colors duration-150 cursor-pointer",
                            speakingActive ? "bg-brand-500 text-white" : "text-muted hover:text-ink"
                          )}
                          onClick={() => {
                            if (speakingActive) {
                              stopSpeaking();
                            } else {
                              startRecording();
                            }
                          }}
                          aria-label={speakingActive ? "停止录音" : "录音本句"}
                        >
                          <Mic size={15} />
                          {speakingActive ? "停止" : "录音本句"}
                        </button>
                      </div>

                      {/* D10 逐句模式状态行（播放中/录音中/回放引导） */}
                      {sentenceShadow.active && (
                        <div className="mt-3 flex items-center gap-2 bg-brand-50 rounded-lg px-3 py-2 text-meta text-brand-600">
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
                                <p className="text-copy font-semibold text-ink">
                                  点击麦克风开始录音
                                </p>
                                <p className="text-meta text-muted mt-0.5">朗读上方高亮字幕</p>
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
                                <p className="text-copy font-semibold text-ink">录音中…</p>
                                <div className="mt-1">
                                  <AudioWaveform stream={recordingStream} barCount={24} />
                                </div>
                              </div>
                              <button
                                className="text-copy font-semibold text-muted hover:text-ink cursor-pointer"
                                onClick={stopSpeaking}
                              >
                                取消
                              </button>
                            </div>
                          )}

                          {speakingState === "reviewing" && (
                            <div className="bg-surface-soft rounded-lg p-3 space-y-3">
                              {/* Status row */}
                              <div className="flex items-center gap-2 text-copy">
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
                                <Button variant="outline" size="sm" onClick={handleReRecord}>
                                  重录
                                </Button>
                                <Button
                                  variant={shadowingSatisfied ? "primary" : "outline"}
                                  size="sm"
                                  onClick={handleToggleSatisfied}
                                  disabled={uploading || !lastAttemptId}
                                  title={
                                    uploading || !lastAttemptId ? "录音保存后可标记" : undefined
                                  }
                                  className={
                                    shadowingSatisfied
                                      ? "bg-success hover:bg-success/90 shadow-none"
                                      : ""
                                  }
                                >
                                  <Check size={13} className="mr-1" />
                                  满意
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={
                                    sentenceShadow.active ? sentenceShadow.next : handleNextSubtitle
                                  }
                                >
                                  下一句
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 最近跟读（紧凑 chips，最多 3 条；0 条时不渲染） */}
                      <ShadowingHistory
                        variant="chips"
                        attempts={attempts}
                        onDelete={deleteAttempt}
                      />
                    </>
                  )
                }
              />
            )}
          </div>

          {/* 移动端动作行（#24/#28 乙）已并入 ⋯ 面板（DEC-069 第 6 条）：首屏不再有它。 */}
          {/* 来源声明（ICP 合规）也已并入 ⋯ 面板：原视频来源 + 版权声明。 */}
        </div>

        {/* ========== RIGHT COLUMN：字幕面板，可折叠为图标栏 ========== */}
        <aside className="bg-canvas border border-hairline rounded-lg lg:sticky lg:top-4 overflow-hidden min-w-0">
          {/* 折叠态在移动端到不了：折叠键已 `hidden lg:flex`（移动端不渲染）、
              `panelCollapsed` 也不持久化 —— 这个守卫只是把「到不了的状态」堵死，
              免得将来有人把折叠键放回移动端时，页面直接落进窄轨分支（DEC-070 T4d）。 */}
          {panelCollapsed && !isMobile ? (
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
                <div className="p-8 text-center text-meta text-muted">
                  字幕已隐藏，按 S 键或控制条切换显示模式
                </div>
              ) : (
                <div
                  ref={subtitleListRef}
                  data-coach="subtitles"
                  // DEC-073：移动端文稿**页级滚动**（去掉 max-h + 内部滚动条）——
                  // 卡内再套一层滚动会让"滚到底了吗"不可知，列表顶部还常留半截行。
                  // 桌面端保持卡内滚动：右栏本身就是 sticky 的，内部滚动才是对的。
                  // 顶部 4px 让被画框下沿压住的第一行不至于贴着切边。
                  className={cn(
                    "subtitle-scroll",
                    isMobile ? "pt-1" : "max-h-[560px] overflow-y-auto p-1.5"
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    {video.subtitles.map((sub, i) => (
                      <button
                        key={sub.id}
                        id={`subtitle-${i}`}
                        onClick={() => {
                          resumeFollow(); // 点文稿行是显式导航：恢复跟随
                          setCurrentSubtitleIndex(i);
                          seekTo(sub.start_time);
                        }}
                        className={cn(
                          "w-full text-left rounded-lg border-l-[3px] border-transparent cursor-pointer transition-colors duration-100 hover:bg-surface-soft p-3",
                          // R5（DEC-070 定案②）：文稿里的当前项**降级**为淡底 + 保留 3px 橙色左
                          // 竖线，文字回到 ink —— 「正在读的那一句」的唯一橙色锚点留给字幕带。
                          i === currentSubtitleIndex && "bg-surface-soft border-l-brand-500"
                        )}
                      >
                        {subtitleMode !== "chinese" && (
                          // 橙色只留给字幕带：当前项不再染 `text-brand-500`（DEC-070 定案②）。
                          <div className="font-medium text-copy leading-relaxed text-ink">
                            {sub.text_en.split(" ").map((word, wi) => (
                              <span key={wi} className={levelClassFor(word, sub.word_levels)}>
                                {word}{" "}
                              </span>
                            ))}
                          </div>
                        )}
                        {(subtitleMode === "bilingual" || subtitleMode === "chinese") &&
                          sub.text_zh && (
                            <div className="text-muted mt-0.5 text-meta">{sub.text_zh}</div>
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

      {/* ===== 练习区：视频试卷已砍（S8-5 撤「暂停开发」徽标），引导到真题练习 ===== */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3.5 flex-wrap gap-3">
          <h2 className="text-copy-lg font-bold tracking-tight text-ink">本视频练习试卷</h2>
        </div>
        <div className="flex items-center gap-3 p-5 bg-canvas border border-dashed border-hairline-strong rounded-lg">
          <span className="w-9 h-9 rounded-lg bg-surface-soft flex items-center justify-center text-brand-500 flex-shrink-0">
            <Layers size={16} />
          </span>
          <p className="text-copy text-muted leading-relaxed">
            本视频暂不出试卷，真题阅读练习已上线——去
            <Link href="/practice/exams" className="text-brand-600 font-semibold hover:underline">
              真题练习
            </Link>
            刷最新卷。
          </p>
        </div>
      </section>

      {/* Word tooltip overlay —— 桌面：可拖动浮动卡；移动端：贴画面下沿升起的浮层（#27 决议乙） */}
      {selectedWord && (
        <div data-coach="word-card">
          {isMobile ? (
            <WordCardSheet
              anchorRef={slotRef}
              word={selectedWord}
              gloss={wordGloss}
              onClose={clearWord}
              onPronounce={() => speakWord(selectedWord)}
              onSave={saveToVocabulary}
            />
          ) : (
            <WordTooltipInline
              word={selectedWord}
              gloss={wordGloss}
              onClose={clearWord}
              onPronounce={() => speakWord(selectedWord)}
              onSave={saveToVocabulary}
              panelCollapsed={panelCollapsed}
            />
          )}
        </div>
      )}

      {/* ⋯ 面板（DEC-069 第 6 条）：来源 / 版权 / 语言 / 字号 / 倍速 / 动作行全部搬进来。
          入口是壳顶栏的 ⋯（44×44），开关状态经 `WatchChromeStore` 来回。 */}
      <WatchMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        subtitleMode={subtitleMode}
        onSubtitleModeChange={setSubtitleMode}
        fontSize={subtitleFontSize}
        onFontSizeChange={handleFontSizeChange}
        rates={PLAYBACK_RATES}
        rate={rate}
        onRateChange={setRate}
        sourceUrl={video.source_url ?? null}
        actions={
          <VideoActions
            compact
            isLiked={isLiked}
            likeCount={likeCount}
            isFavorited={isFavorited}
            vocabSet={vocabSet}
            addingVocabSet={addingVocabSet}
            noteOpen={noteOpen}
            onToggleLike={toggleLike}
            onToggleFavorite={toggleFavorite}
            onVocabSet={handleVocabSetClick}
            onNotes={() => setNoteOpen((v) => !v)}
            onDrill={() => router.push("/vocabulary")}
          />
        }
        extra={noteOpen ? notesPanel : null}
      />

      {/* 跟读抽屉（#26 决议乙）：移动端练习区，入口搬到了壳底栏的「跟读」 */}
      {isMobile && practiceOpen && currentSubtitle && (
        <ShadowingDrawer
          anchorRef={slotRef}
          onClose={closePractice}
          index={currentSubtitleIndex}
          total={video.subtitles.length}
          textEn={currentSubtitle.text_en}
          textZh={currentSubtitle.text_zh}
          speakingState={speakingState}
          seconds={seconds}
          recordingStream={recordingStream}
          audioBlob={audioBlob}
          audioUrl={audioUrl}
          uploading={uploading}
          saved={shadowingSaved}
          satisfied={shadowingSatisfied}
          canSatisfy={!!lastAttemptId}
          originalUrl={originalSourceUrl}
          originalClip={originalClip}
          onPlayOriginal={playOriginal}
          onStart={startRecording}
          onStop={stopRecording}
          onReRecord={handleReRecord}
          onToggleSatisfied={handleToggleSatisfied}
          onNext={sentenceShadow.active ? sentenceShadow.next : handleNextSubtitle}
          sentenceActive={sentenceShadow.active}
          sentencePhase={sentenceShadow.phase}
          autoAdvance={sentenceShadow.autoAdvance}
          onAutoAdvanceChange={sentenceShadow.setAutoAdvance}
          attempts={attempts}
          onDeleteAttempt={deleteAttempt}
          ytMode={isYtMode}
        />
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
