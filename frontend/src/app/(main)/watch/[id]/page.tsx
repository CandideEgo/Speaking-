'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SubtitleList from '@/components/subtitle/SubtitleList';
import WordTooltip from '@/components/subtitle/WordTooltip';
import SpeakingPanel from '@/components/speaking/SpeakingPanel';
import QuizPanel from '@/components/speaking/QuizPanel';
import PlayerControlBar from '@/components/player/PlayerControlBar';
import SubtitleModeTabs from '@/components/SubtitleModeTabs';
import FlashcardMode from '@/components/FlashcardMode';
import TranslateMode from '@/components/TranslateMode';
import DictationMode from '@/components/DictationMode';
import FillBlankMode from '@/components/FillBlankMode';
import ReadingMode from '@/components/ReadingMode';
import { useWatchStore } from '@/stores/watchStore';
import { useAuthStore } from '@/stores/authStore';
import { usePanelResize } from '@/hooks/usePanelResize';
import { useVideoPlayer } from '@/hooks/useVideoPlayer';
import { useYouTubePlayer } from '@/hooks/useYouTubePlayer';
import { useQuiz } from '@/hooks/useQuiz';
import { useWordLookup } from '@/hooks/useWordLookup';
import { mediaUrl } from '@/lib/api';
import { findSubtitleIndex } from '@/lib/subtitles';
import { cn } from '@/lib/utils';
import { ArrowLeft, Loader2, Zap, Play, BookOpen, X } from 'lucide-react';

/** Human-readable labels for processing steps returned by the backend. */
const STEP_LABELS: Record<string, string> = {
  extracting: '提取视频信息...',
  transcribing: '语音转录中...',
  splitting: '说话人识别中...',
  translating: '字幕翻译中...',
  downloading: '下载视频中...',
  transcoding: '视频转码中...',
};

function ShortcutsPopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute right-4 top-16 z-20 w-56 rounded-lg border border-hairline bg-cream-card p-4 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ink">快捷键</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-ink" aria-label="关闭"><X size={14} /></button>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <p><kbd className="rounded bg-cream-soft px-1 py-0.5 font-mono text-ink/70">Space</kbd> 播放/暂停</p>
        <p><kbd className="rounded bg-cream-soft px-1 py-0.5 font-mono text-ink/70">&larr;&rarr;</kbd> 快进/快退 5 秒</p>
        <p><kbd className="rounded bg-cream-soft px-1 py-0.5 font-mono text-ink/70">&uarr;&darr;</kbd> 上一句/下一句</p>
      </div>
    </div>
  );
}

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<'subtitles' | 'quiz'>('subtitles');
  const { subtitleMode, leftPanelWidth, setLeftPanelWidth, setVideoAspectRatio } = useWatchStore();
  const { video, playbackMode, currentSubtitleIndex, setCurrentSubtitleIndex, isDesktop,
    videoRef, seekTo, navigateSubtitle } = useVideoPlayer({ videoId: id, setVideoAspectRatio });
  const ytPlayer = useYouTubePlayer();
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytTimeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Whether to show the YouTube embed as fallback
  const showYouTube = !!video?.youtube_video_id && playbackMode !== 'ready';

  // Initialize YouTube player when fallback is needed
  useEffect(() => {
    if (!showYouTube || !video?.youtube_video_id) return;
    ytPlayer.initPlayer(
      'yt-player-container',
      video.youtube_video_id,
      undefined,
      undefined,
    );
    return () => { ytPlayer.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showYouTube, video?.youtube_video_id]);

  // Destroy YouTube player when local video becomes ready
  useEffect(() => {
    if (playbackMode === 'ready' && ytPlayer.isReady) {
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

    return () => { if (ytTimeRef.current) clearInterval(ytTimeRef.current); };
  }, [showYouTube, ytPlayer.isReady, video?.subtitles, setCurrentSubtitleIndex, ytPlayer]);

  const { quizQuestions, quizAnswers, quizSubmitted, quizScore, handleQuizAnswer, submitQuiz } = useQuiz({ videoId: id });
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const requireAuth = (): boolean => { if (!isAuthenticated) { router.push('/login'); return false; } return true; };
  const { selectedWord, wordMeaning, handleWordClick, saveToVocabulary, speakWord, clearWord } =
    useWordLookup({ requireAuth, getSubtitles: () => video?.subtitles, videoId: id });
  const { startResize } = usePanelResize({ leftPanelWidth, setLeftPanelWidth, onResizeStart: () => {}, onResizeEnd: () => {} });
  const activeSubtitle = video?.subtitles.find((s) => s.id === activeSubtitleId);

  function handleStartSpeaking(sid: string) { if (requireAuth()) setActiveSubtitleId(sid); }
  function handleNextSubtitle() {
    if (!video?.subtitles) return;
    const idx = video.subtitles.findIndex((s) => s.id === activeSubtitleId);
    if (idx >= 0 && idx < video.subtitles.length - 1) {
      const next = video.subtitles[idx + 1];
      setCurrentSubtitleIndex(idx + 1); seekTo(next.start_time); handleStartSpeaking(next.id);
    }
  }

  if (!video) return <main className="flex min-h-screen items-center justify-center bg-parchment"><Loader2 size={24} className="animate-spin text-coral" /></main>;

  // Processing state with no YouTube fallback — show progress spinner
  if (playbackMode === 'processing' && !video.youtube_video_id) {
    const stepLabel = video.processing_step ? (STEP_LABELS[video.processing_step] ?? '处理中...') : '处理中...';
    return (
      <main className="flex min-h-screen items-center justify-center bg-parchment">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto animate-spin text-coral" />
          <p className="mt-4 text-ink">{stepLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">视频下载和转码需要几分钟，请稍候</p>
          {video.status === 'ready_subtitles' && <p className="mt-2 text-xs text-accent-teal">字幕已就绪，视频处理中...</p>}
        </div>
      </main>
    );
  }

  if (video.status === 'error') return (
    <main className="flex min-h-screen items-center justify-center bg-parchment"><div className="text-center"><p className="text-olive">处理失败</p><p className="mt-1 text-sm text-error">{video.error_message || '未知错误'}</p><button onClick={() => router.push('/')} className="mt-4 text-sm text-coral hover:underline">返回首页</button></div></main>
  );

  const sub = video.subtitles[currentSubtitleIndex];
  const isBiOrEn = subtitleMode === 'bilingual' || subtitleMode === 'english';

  return (
    <main className="flex flex-col lg:flex-row h-full bg-canvas overflow-hidden">
      <div className="flex flex-col min-w-0 min-h-0" style={isDesktop ? { width: `${leftPanelWidth}%` } : undefined}>
        <div className="relative flex items-center gap-3 border-b border-hairline bg-canvas px-4 py-2.5 shrink-0">
          <button onClick={() => router.push('/')} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-cream-soft hover:text-ink transition-colors" aria-label="返回首页"><ArrowLeft size={16} /></button>
          <h1 className="flex-1 truncate text-lg font-medium text-ink">{video.title}</h1>
          <button onClick={() => setShowShortcuts(!showShortcuts)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-ink" title="快捷键" aria-label="快捷键"><Zap size={14} /></button>
          {showShortcuts && <ShortcutsPopup onClose={() => setShowShortcuts(false)} />}
        </div>
        <div className="flex-1 flex items-center justify-center bg-navy min-h-0 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center">
            {playbackMode === 'ready' && video.video_url_720p ? (
              <video ref={videoRef} src={mediaUrl(video.video_url_720p)} controls className="w-full h-full object-contain" onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth > 0 && v.videoHeight > 0) setVideoAspectRatio(v.videoWidth / v.videoHeight); }} onTimeUpdate={(e) => { const idx = findSubtitleIndex(video.subtitles, e.currentTarget.currentTime); if (idx !== -1) setCurrentSubtitleIndex(idx); }} />
            ) : showYouTube ? (
              <div ref={ytContainerRef} className="w-full h-full">
                <div id="yt-player-container" className="w-full h-full" />
              </div>
            ) : (
              <div className="flex items-center justify-center py-32"><Play size={40} className="mx-auto text-ink/30" /><p className="mt-3 text-sm text-ink/40">视频未就绪</p></div>
            )}
          </div>
        </div>
        <div className="border-t border-hairline bg-cream-soft px-8 py-5 shrink-0">
          {sub && <div className="text-center">
            <p className="text-base leading-relaxed text-ink font-medium">{sub.text_en.split(' ').map((word, wi) => {
              const clean = word.replace(/[.,!?;:'"]/g, '');
              return <span key={wi} onClick={() => handleWordClick(word)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleWordClick(word); } }} className={cn('cursor-pointer rounded hover:bg-coral/20', selectedWord === clean && 'bg-coral/30')}>{word}{' '}</span>;
            })}</p>
            {subtitleMode === 'bilingual' && sub.text_zh && <p className="mt-1 text-sm text-muted-foreground">{sub.text_zh}</p>}
          </div>}
        </div>
        <PlayerControlBar videoRef={videoRef} playbackMode={playbackMode} subtitles={video.subtitles} onPrevSubtitle={() => navigateSubtitle(-1)} onNextSubtitle={() => navigateSubtitle(1)} onSeekTo={seekTo} variant="light" />
        {activeSubtitleId && activeSubtitle && <SpeakingPanel activeSubtitleId={activeSubtitleId} activeSubtitleText={activeSubtitle.text_en} onNextSubtitle={handleNextSubtitle} />}
      </div>

      <div className="hidden lg:flex w-1.5 cursor-col-resize hover:bg-coral/30 active:bg-coral/50 transition-colors relative shrink-0 z-10" onMouseDown={startResize}>
        <div className="absolute inset-y-0 -left-2 -right-2" />
      </div>

      <div className="flex flex-col min-w-0 min-h-0 border-t lg:border-t-0 lg:border-l border-hairline bg-canvas" style={isDesktop ? { width: `${100 - leftPanelWidth}%` } : undefined}>
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center border-b border-hairline bg-canvas">
            <div className="flex-1 min-w-0"><SubtitleModeTabs /></div>
            {isBiOrEn && <button onClick={() => setPanelTab(panelTab === 'quiz' ? 'subtitles' : 'quiz')} className={cn('flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap border-l border-hairline transition-colors shrink-0', panelTab === 'quiz' ? 'text-coral bg-coral/10' : 'text-muted-foreground hover:text-ink hover:bg-cream-soft')} title={panelTab === 'quiz' ? '返回字幕' : '测验'} aria-label={panelTab === 'quiz' ? '返回字幕' : '测验'}>
              <BookOpen size={14} /><span>测验</span>
              {quizQuestions.length > 0 && !quizSubmitted && panelTab !== 'quiz' && <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[10px] text-white">{quizQuestions.length}</span>}
            </button>}
          </div>
          <div className="h-full overflow-y-auto subtitle-scroll">
            {subtitleMode === 'dictation' && <DictationMode subtitles={video.subtitles} />}
            {subtitleMode === 'fillblank' && <FillBlankMode subtitles={video.subtitles} />}
            {subtitleMode === 'translate' && <TranslateMode subtitles={video.subtitles} />}
            {subtitleMode === 'flashcard' && <FlashcardMode subtitles={video.subtitles} />}
            {subtitleMode === 'reading' && <ReadingMode subtitles={video.subtitles} selectedWord={selectedWord} onWordClick={handleWordClick} />}
            {isBiOrEn && <>{panelTab === 'quiz' && <div className="p-4"><QuizPanel quizQuestions={quizQuestions} quizAnswers={quizAnswers} quizSubmitted={quizSubmitted} quizScore={quizScore} videoStatus={video.status} onAnswer={handleQuizAnswer} onSubmit={submitQuiz} /></div>}
              {panelTab === 'subtitles' && <SubtitleList subtitles={video.subtitles} currentIndex={currentSubtitleIndex} selectedWord={selectedWord} onSubtitleClick={(i, st) => { setCurrentSubtitleIndex(i); seekTo(st); }} onWordClick={handleWordClick} onStartSpeaking={handleStartSpeaking} />}</>}
          </div>
        </div>
      </div>

      {selectedWord && <WordTooltip word={selectedWord} meaning={wordMeaning} onClose={clearWord} onPronounce={() => speakWord(selectedWord)} onSave={saveToVocabulary} />}
    </main>
  );
}
