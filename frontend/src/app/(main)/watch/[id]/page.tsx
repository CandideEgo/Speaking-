'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, getToken, mediaUrl } from '@/lib/api';
import type { VideoWithSubtitles, QuizQuestion } from '@/types';
import YouTubePlayer, { type YouTubePlayerHandle } from '@/components/YouTubePlayer';
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
import { useWatchStore } from '@/stores/watchStore';
import { usePanelResize } from '@/hooks/usePanelResize';
import { findSubtitleIndex } from '@/lib/subtitles';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Loader2, Zap, Play, BookOpen, X,
} from 'lucide-react';

/** Generate mock phonetic transcription from English text */
function generatePhonetic(text: string): string {
  const words = text.split(' ').slice(0, 8);
  return words.map(() => '·').join(' ');
}

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);

  const [video, setVideo] = useState<VideoWithSubtitles | null>(null);
  const [playbackMode, setPlaybackMode] = useState<'local' | 'youtube' | 'loading'>('loading');
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(0);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordMeaning, setWordMeaning] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<'subtitles' | 'quiz'>('subtitles');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);

  const activeSubtitle = video?.subtitles.find((s) => s.id === activeSubtitleId);
  const { subtitleMode, leftPanelWidth, setLeftPanelWidth, videoAspectRatio, setVideoAspectRatio } = useWatchStore();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const check = (e: MediaQueryListEvent | MediaQueryList) => setIsDesktop(e.matches);
    check(mql);
    mql.addEventListener('change', check);
    return () => mql.removeEventListener('change', check);
  }, []);

  useEffect(() => {
    api<VideoWithSubtitles>(`/api/v1/videos/${id}`).then((v) => {
      setVideo(v);
      if (v.status === 'ready' && v.video_url_720p) setPlaybackMode('local');
      else if (v.status === 'ready' && v.youtube_video_id && !v.video_url_720p) setPlaybackMode('youtube');
      else if ((v.status === 'ready_subtitles' || v.status === 'processing') && v.youtube_video_id) setPlaybackMode('youtube');
      else setPlaybackMode('loading');
    }).catch(() => toast.error('加载视频失败'));
  }, [id]);

  useEffect(() => {
    const el = document.getElementById(`subtitle-${currentSubtitleIndex}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentSubtitleIndex]);

  useEffect(() => {
    api<{ quiz: QuizQuestion[] }>(`/api/v1/videos/${id}/quiz`).then((data) => setQuizQuestions(data.quiz || [])).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!video || (video.status !== 'processing' && video.status !== 'ready_subtitles')) return;
    const interval = setInterval(async () => {
      try {
        const updated = await api<VideoWithSubtitles>(`/api/v1/videos/${id}`);
        if (updated.status === 'ready') { setVideo(updated); setPlaybackMode(updated.video_url_720p ? 'local' : 'youtube'); }
        else if (updated.status === 'ready_subtitles') { setVideo(updated); setPlaybackMode('youtube'); }
        else if (updated.status === 'error') setPlaybackMode('loading');
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [video?.status, id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlayPause(); break;
        case 'ArrowLeft': seekBy(-5); break;
        case 'ArrowRight': seekBy(5); break;
        case 'ArrowUp': navigateSubtitle(-1); break;
        case 'ArrowDown': navigateSubtitle(1); break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [video, currentSubtitleIndex, playbackMode]);

  function togglePlayPause() {
    if (playbackMode === 'youtube') {
      if (playerRef.current?.isPaused()) playerRef.current?.play();
      else playerRef.current?.pause();
    } else {
      if (videoRef.current?.paused) videoRef.current?.play();
      else videoRef.current?.pause();
    }
  }

  function seekBy(delta: number) {
    if (playbackMode === 'youtube') {
      const currentTime = playerRef.current?.getCurrentTime?.() ?? 0;
      playerRef.current?.seekTo(Math.max(0, currentTime + delta));
    } else if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + delta);
    }
  }

  function navigateSubtitle(delta: number) {
    if (!video?.subtitles) return;
    const newIndex = Math.max(0, Math.min(video.subtitles.length - 1, currentSubtitleIndex + delta));
    setCurrentSubtitleIndex(newIndex);
    seekTo(video.subtitles[newIndex].start_time);
  }

  function seekTo(time: number) {
    if (playbackMode === 'youtube') {
      playerRef.current?.seekTo(time);
      playerRef.current?.play();
    } else if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  }

  async function handleWordClick(word: string) {
    const clean = word.replace(/[.,!?;:'"]/g, '');
    if (selectedWord === clean) {
      setSelectedWord(null);
      setWordMeaning(null);
      return;
    }
    setSelectedWord(clean);
    setWordMeaning(null);
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'en-US';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    try {
      const ctx = video?.subtitles.find((s) => s.text_en.includes(clean));
      if (ctx) {
        const res = await api<{ meaning: string }>(`/api/v1/ai/word-lookup?word=${encodeURIComponent(clean)}&sentence=${encodeURIComponent(ctx.text_en)}`);
        setWordMeaning(res.meaning);
      }
    } catch {
      setWordMeaning('单词查询需要 Pro 订阅。');
    }
  }

  async function saveToVocabulary() {
    if (!selectedWord || !requireAuth()) return;
    const ctx = video?.subtitles.find((s) => s.text_en.includes(selectedWord));
    try {
      const params = new URLSearchParams({ word: selectedWord });
      if (ctx?.text_en) params.set('context_sentence', ctx.text_en);
      if (video?.id) params.set('video_id', video.id);
      await api(`/api/v1/vocabulary?${params.toString()}`, { method: 'POST' });
      toast.success(`"${selectedWord}" 已保存到词汇本`);
    } catch {
      toast.error('保存失败');
    }
  }

  function requireAuth(): boolean {
    if (!getToken()) { router.push('/login'); return false; }
    return true;
  }

  const { startResize } = usePanelResize({
    leftPanelWidth,
    setLeftPanelWidth,
    onResizeStart: () => {},
    onResizeEnd: () => {},
  });

  function handleStartSpeaking(sid: string) {
    if (!requireAuth()) return;
    setActiveSubtitleId(sid);
  }

  function handleNextSubtitle() {
    if (!video?.subtitles) return;
    const idx = video.subtitles.findIndex((s) => s.id === activeSubtitleId);
    if (idx >= 0 && idx < video.subtitles.length - 1) {
      const next = video.subtitles[idx + 1];
      setCurrentSubtitleIndex(idx + 1);
      seekTo(next.start_time);
      handleStartSpeaking(next.id);
    }
  }

  function handleQuizAnswer(qi: number, a: string) {
    setQuizAnswers((prev) => ({ ...prev, [qi]: a }));
  }

  async function submitQuiz() {
    const correct = quizQuestions.filter((q, i) => {
      const ua = (quizAnswers[i] || '').trim().toLowerCase();
      return ua === q.answer.trim().toLowerCase();
    }).length;
    const score = Math.round((correct / quizQuestions.length) * 100);
    setQuizScore(score);
    setQuizSubmitted(true);
    try {
      const form = new FormData();
      form.append('score', String(score));
      await api(`/api/v1/videos/${id}/quiz/submit`, { method: 'POST', body: form, headers: {} as Record<string, string> });
    } catch {}
  }

  if (!video) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-parchment'>
        <Loader2 size={24} className='animate-spin text-coral' />
      </main>
    );
  }

  if (video.status === 'processing' && video.subtitles.length === 0 && !video.youtube_video_id) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-parchment'>
        <div className='text-center'>
          <Loader2 size={32} className='mx-auto animate-spin text-terracotta' />
          <p className='mt-4 text-olive'>正在准备字幕，约 5-10 秒...</p>
        </div>
      </main>
    );
  }

  if (video.status === 'error') {
    return (
      <main className='flex min-h-screen items-center justify-center bg-parchment'>
        <div className='text-center'>
          <p className='text-olive'>处理失败</p>
          <p className='mt-1 text-sm text-error'>{video.error_message || '未知错误'}</p>
          <button onClick={() => router.push('/')} className='mt-4 text-sm text-coral hover:underline'>返回首页</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col lg:flex-row h-full bg-canvas overflow-hidden">
      {/* Left side: Video area */}
      <div className="flex flex-col min-w-0 min-h-0" style={isDesktop ? { width: `${leftPanelWidth}%` } : undefined}>
        {/* Header */}
        <div className="relative flex items-center gap-3 border-b border-hairline bg-canvas px-4 py-2.5 shrink-0">
          <button onClick={() => router.push('/')} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-cream-soft hover:text-ink transition-colors">
            <ArrowLeft size={16} />
          </button>
          <h1 className="flex-1 truncate text-lg font-medium text-ink">{video.title}</h1>
          <button onClick={() => setShowShortcuts(!showShortcuts)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-ink" title="快捷键">
            <Zap size={14} />
          </button>
        </div>

        {/* Shortcuts popup */}
        {showShortcuts && (
          <div className="absolute right-4 top-16 z-20 w-56 rounded-lg border border-hairline bg-cream-card p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-ink">快捷键</p>
              <button onClick={() => setShowShortcuts(false)} className="text-muted-foreground hover:text-ink">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p><kbd className="rounded bg-cream-soft px-1 py-0.5 font-mono text-ink/70">Space</kbd> 播放/暂停</p>
              <p><kbd className="rounded bg-cream-soft px-1 py-0.5 font-mono text-ink/70">&larr;&rarr;</kbd> 快进/快退 5 秒</p>
              <p><kbd className="rounded bg-cream-soft px-1 py-0.5 font-mono text-ink/70">&uarr;&darr;</kbd> 上一句/下一句</p>
            </div>
          </div>
        )}

        {/* Video player — fill available space without scroll */}
        <div className="flex-1 flex items-center justify-center bg-navy min-h-0 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center">
            {playbackMode === 'youtube' && video.youtube_video_id ? (
              <YouTubePlayer
                ref={playerRef}
                videoId={video.youtube_video_id}
                onDimensionsChange={(w, h) => setVideoAspectRatio(w / h)}
                onTimeUpdate={(t) => {
                  if (!video?.subtitles) return;
                  const idx = findSubtitleIndex(video.subtitles, t);
                  if (idx !== -1) setCurrentSubtitleIndex(idx);
                }}
              />
            ) : playbackMode === 'local' && video.video_url_720p ? (
              <video
                ref={videoRef}
                src={mediaUrl(video.video_url_720p)}
                controls
                className="w-full h-full object-contain"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth > 0 && v.videoHeight > 0) {
                    setVideoAspectRatio(v.videoWidth / v.videoHeight);
                  }
                }}
                onTimeUpdate={(e) => {
                  const t = e.currentTarget.currentTime;
                  const idx = findSubtitleIndex(video.subtitles, t);
                  if (idx !== -1) setCurrentSubtitleIndex(idx);
                }}
              />
            ) : (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <Play size={40} className="mx-auto text-ink/30" />
                  <p className="mt-3 text-sm text-ink/40">视频未就绪</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current subtitle display — compact */}
        <div className="border-t border-hairline bg-cream-soft px-8 py-5 shrink-0">
          {video.subtitles?.[currentSubtitleIndex] && (
            <div className="text-center">
              {/* English text — always show */}
              <p className="text-base leading-relaxed text-ink font-medium">
                {video.subtitles[currentSubtitleIndex].text_en.split(' ').map((word, wi) => {
                  const clean = word.replace(/[.,!?;:'"]/g, '');
                  return (
                    <span key={wi} onClick={() => handleWordClick(word)} className={cn('cursor-pointer rounded hover:bg-coral/20', selectedWord === clean && 'bg-coral/30')}>
                      {word}{' '}
                    </span>
                  );
                })}
              </p>
              {/* Chinese translation — only show in bilingual mode */}
              {subtitleMode === 'bilingual' && video.subtitles[currentSubtitleIndex].text_zh && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {video.subtitles[currentSubtitleIndex].text_zh}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Player control bar — compact */}
        <PlayerControlBar
          playerRef={playerRef}
          videoRef={videoRef}
          playbackMode={playbackMode}
          subtitles={video.subtitles}
          onPrevSubtitle={() => navigateSubtitle(-1)}
          onNextSubtitle={() => navigateSubtitle(1)}
          onSeekTo={seekTo}
          variant="light"
        />

        {/* Speaking panel */}
        {activeSubtitleId && activeSubtitle && (
          <SpeakingPanel activeSubtitleId={activeSubtitleId} activeSubtitleText={activeSubtitle.text_en} onNextSubtitle={handleNextSubtitle} />
        )}
      </div>

      {/* Resize handle */}
      <div
        className="hidden lg:flex w-1.5 cursor-col-resize hover:bg-coral/30 active:bg-coral/50 transition-colors relative shrink-0 z-10"
        onMouseDown={startResize}
      >
        <div className="absolute inset-y-0 -left-2 -right-2" />
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100">
          <div className="w-0.5 h-0.5 rounded-full bg-white/40" />
          <div className="w-0.5 h-0.5 rounded-full bg-white/40" />
          <div className="w-0.5 h-0.5 rounded-full bg-white/40" />
        </div>
      </div>

      {/* Right side: Subtitle panel — only this should scroll */}
      <div className="flex flex-col min-w-0 min-h-0 border-t lg:border-t-0 lg:border-l border-hairline bg-canvas" style={isDesktop ? { width: `${100 - leftPanelWidth}%` } : undefined}>
        {/* Panel content */}
        <div className="flex-1 overflow-hidden">
          {/* Mode tabs + quiz toggle */}
          <div className="flex items-center border-b border-hairline bg-canvas">
            <div className="flex-1 min-w-0">
              <SubtitleModeTabs />
            </div>
            {/* Quiz toggle — only show for bilingual/english modes */}
            {(subtitleMode === 'bilingual' || subtitleMode === 'english') && (
              <button
                onClick={() => setPanelTab(panelTab === 'quiz' ? 'subtitles' : 'quiz')}
                className={cn(
                  'flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap border-l border-hairline transition-colors shrink-0',
                  panelTab === 'quiz'
                    ? 'text-coral bg-coral/10'
                    : 'text-muted-foreground hover:text-ink hover:bg-cream-soft'
                )}
                title={panelTab === 'quiz' ? '返回字幕' : '测验'}
              >
                <BookOpen size={14} />
                <span>测验</span>
                {quizQuestions.length > 0 && !quizSubmitted && panelTab !== 'quiz' && (
                  <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[10px] text-white">
                    {quizQuestions.length}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="h-full overflow-y-auto subtitle-scroll">
            {/* Mode-based content */}
            {subtitleMode === 'dictation' && (
              <DictationMode subtitles={video.subtitles} />
            )}
            {subtitleMode === 'fillblank' && (
              <FillBlankMode subtitles={video.subtitles} />
            )}
            {subtitleMode === 'translate' && (
              <TranslateMode subtitles={video.subtitles} />
            )}
            {subtitleMode === 'flashcard' && (
              <FlashcardMode subtitles={video.subtitles} />
            )}

            {/* Default subtitle/quiz panel */}
            {(subtitleMode === 'bilingual' || subtitleMode === 'english') && (
              <>
                {panelTab === 'quiz' && (
                  <div className="p-4">
                    <QuizPanel quizQuestions={quizQuestions} quizAnswers={quizAnswers} quizSubmitted={quizSubmitted} quizScore={quizScore} videoStatus={video.status} onAnswer={handleQuizAnswer} onSubmit={submitQuiz} />
                  </div>
                )}

                {panelTab === 'subtitles' && (
                  <SubtitleList
                    subtitles={video.subtitles}
                    currentIndex={currentSubtitleIndex}
                    selectedWord={selectedWord}
                    onSubtitleClick={(i, startTime) => { setCurrentSubtitleIndex(i); seekTo(startTime); }}
                    onWordClick={handleWordClick}
                    onStartSpeaking={handleStartSpeaking}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Word tooltip */}
      {selectedWord && (
        <WordTooltip
          word={selectedWord}
          meaning={wordMeaning}
          onClose={() => { setSelectedWord(null); setWordMeaning(null); }}
          onPronounce={() => {
            const u = new SpeechSynthesisUtterance(selectedWord);
            u.lang = 'en-US';
            speechSynthesis.cancel();
            speechSynthesis.speak(u);
          }}
          onSave={saveToVocabulary}
        />
      )}
    </main>
  );
}
