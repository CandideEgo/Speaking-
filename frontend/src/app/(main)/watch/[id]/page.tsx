'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, getToken, mediaUrl } from '@/lib/api';
import type { VideoWithSubtitles, QuizQuestion, SpeakingResult } from '@/types';
import YouTubePlayer, { type YouTubePlayerHandle } from '@/components/YouTubePlayer';
import SubtitleList from '@/components/subtitle/SubtitleList';
import WordTooltip from '@/components/subtitle/WordTooltip';
import SpeakingPanel from '@/components/speaking/SpeakingPanel';
import QuizPanel from '@/components/speaking/QuizPanel';
import PlaybackControls from '@/components/PlaybackControls';
import SubtitleModeTabs from '@/components/SubtitleModeTabs';
import FlashcardMode from '@/components/FlashcardMode';
import ReadingMode from '@/components/ReadingMode';
import TranslateMode from '@/components/TranslateMode';
import DictationMode from '@/components/DictationMode';
import FillBlankMode from '@/components/FillBlankMode';
import { useWatchStore } from '@/stores/watchStore';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Languages, Loader2, Zap, Play, BookOpen, X,
} from 'lucide-react';

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
  const [showEnglishOnly, setShowEnglishOnly] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<'subtitles' | 'quiz'>('subtitles');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  const activeSubtitle = video?.subtitles.find((s) => s.id === activeSubtitleId);
  const { subtitleMode } = useWatchStore();

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

  // Progress tracking
  useEffect(() => {
    const interval = setInterval(() => {
      let currentTime = 0;
      let duration = 1;
      if (playbackMode === 'youtube') {
        currentTime = playerRef.current?.getCurrentTime?.() ?? 0;
        duration = video?.subtitles[video.subtitles.length - 1]?.end_time || 1;
      } else if (playbackMode === 'local' && videoRef.current) {
        currentTime = videoRef.current.currentTime;
        duration = videoRef.current.duration || 1;
      }
      setProgress((currentTime / duration) * 100);
    }, 1000);
    return () => clearInterval(interval);
  }, [playbackMode, video]);

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
      <main className='flex min-h-screen items-center justify-center bg-canvas'>
        <Loader2 size={24} className='animate-spin text-coral' />
      </main>
    );
  }

  if (video.status === 'processing' && video.subtitles.length === 0 && !video.youtube_video_id) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-canvas'>
        <div className='text-center'>
          <Loader2 size={32} className='mx-auto animate-spin text-coral' />
          <p className='mt-4 text-muted-foreground'>正在准备字幕，约 5-10 秒...</p>
        </div>
      </main>
    );
  }

  if (video.status === 'error') {
    return (
      <main className='flex min-h-screen items-center justify-center bg-canvas'>
        <div className='text-center'>
          <p className='text-muted-foreground'>处理失败</p>
          <p className='mt-1 text-sm text-red-500'>{video.error_message || '未知错误'}</p>
          <button onClick={() => router.push('/')} className='mt-4 text-sm text-coral hover:underline'>返回首页</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col lg:flex-row h-screen bg-navy overflow-hidden">
      {/* Left side: Video area */}
      <div className="flex flex-col flex-1 lg:flex-[55] min-w-0 min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/10 bg-navy px-4 py-2.5 shrink-0">
          <button onClick={() => router.push('/')} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <h1 className="flex-1 truncate text-sm font-medium text-white">{video.title}</h1>
          <button onClick={() => setShowEnglishOnly(!showEnglishOnly)} className={cn('flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium border transition-colors', showEnglishOnly ? 'bg-coral/20 text-coral border-coral/30' : 'border-white/10 text-white/60 hover:text-white hover:border-white/20')}>
            <Languages size={14} /> {showEnglishOnly ? 'English' : '双语'}
          </button>
          <button onClick={() => setShowShortcuts(!showShortcuts)} className="rounded-md px-2 py-1 text-xs text-white/40 hover:text-white">
            <Zap size={14} />
          </button>
        </div>

        {/* Shortcuts popup */}
        {showShortcuts && (
          <div className="absolute right-4 top-16 z-20 w-56 rounded-lg border border-white/10 bg-navy-elevated p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white">快捷键</p>
              <button onClick={() => setShowShortcuts(false)} className="text-white/40 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1.5 text-xs text-white/50">
              <p><kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-white/70">Space</kbd> 播放/暂停</p>
              <p><kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-white/70">&larr;&rarr;</kbd> 快进/快退 5 秒</p>
              <p><kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-white/70">&uarr;&darr;</kbd> 上一句/下一句</p>
            </div>
          </div>
        )}

        {/* Video player */}
        <div className="flex-1 flex items-center justify-center bg-black min-h-0">
          <div className="w-full max-w-4xl">
            {playbackMode === 'youtube' && video.youtube_video_id ? (
              <YouTubePlayer ref={playerRef} videoId={video.youtube_video_id} onTimeUpdate={(t) => {
                if (!video?.subtitles) return;
                const idx = video.subtitles.findIndex((s) => t >= s.start_time && t <= s.end_time);
                if (idx !== -1) setCurrentSubtitleIndex(idx);
              }} />
            ) : playbackMode === 'local' && video.video_url_720p ? (
              <video ref={videoRef} src={mediaUrl(video.video_url_720p)} controls className="w-full" onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                const idx = video.subtitles.findIndex((s) => t >= s.start_time && t <= s.end_time);
                if (idx !== -1) setCurrentSubtitleIndex(idx);
              }} />
            ) : (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <Play size={40} className="mx-auto text-white/30" />
                  <p className="mt-3 text-sm text-white/40">视频未就绪</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current subtitle display */}
        <div className="border-t border-white/10 bg-navy-soft px-6 py-3 shrink-0">
          {video.subtitles?.[currentSubtitleIndex] && (
            <div className="text-center">
              <p className="text-base leading-relaxed text-white font-medium">
                {video.subtitles[currentSubtitleIndex].text_en.split(' ').map((word, wi) => {
                  const clean = word.replace(/[.,!?;:'"]/g, '');
                  return (
                    <span key={wi} onClick={() => handleWordClick(word)} className={cn('cursor-pointer rounded hover:bg-coral/20', selectedWord === clean && 'bg-coral/30')}>
                      {word}{' '}
                    </span>
                  );
                })}
              </p>
              {!showEnglishOnly && video.subtitles[currentSubtitleIndex].text_zh && <p className="mt-0.5 text-sm text-white/50">{video.subtitles[currentSubtitleIndex].text_zh}</p>}
            </div>
          )}
        </div>

        {/* Playback controls */}
        <PlaybackControls
          playerRef={playerRef}
          videoRef={videoRef}
          playbackMode={playbackMode}
          subtitles={video.subtitles}
          onPrevSubtitle={() => navigateSubtitle(-1)}
          onNextSubtitle={() => navigateSubtitle(1)}
          onSeekTo={seekTo}
        />

        {/* Speaking panel */}
        {activeSubtitleId && activeSubtitle && (
          <SpeakingPanel activeSubtitleId={activeSubtitleId} activeSubtitleText={activeSubtitle.text_en} onNextSubtitle={handleNextSubtitle} />
        )}
      </div>

      {/* Right side: Subtitle panel */}
      <div className="flex flex-col flex-1 lg:flex-[45] border-t lg:border-t-0 lg:border-l border-white/10 bg-navy min-w-0 min-h-0">
        {/* Mode tabs */}
        <SubtitleModeTabs />

        {/* Panel content */}
        <div className="flex-1 overflow-hidden">
          <div className="flex border-b border-white/10 bg-navy">
            <button onClick={() => setPanelTab('subtitles')} className={cn('flex-1 py-2.5 text-xs font-medium transition-colors', panelTab === 'subtitles' ? 'text-coral border-b-2 border-coral' : 'text-white/40 hover:text-white/70')}>
              <Languages size={14} className="inline mr-1" />字幕
            </button>
            <button onClick={() => setPanelTab('quiz')} className={cn('flex-1 py-2.5 text-xs font-medium transition-colors', panelTab === 'quiz' ? 'text-coral border-b-2 border-coral' : 'text-white/40 hover:text-white/70')}>
              <BookOpen size={14} className="inline mr-1" />测验
              {quizQuestions.length > 0 && !quizSubmitted && <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white">{quizQuestions.length}</span>}
            </button>
          </div>

          <div className="h-full overflow-y-auto subtitle-scroll">
            {/* Mode-based content */}
            {subtitleMode === 'dictation' && video.subtitles[currentSubtitleIndex] && (
              <DictationMode subtitle={video.subtitles[currentSubtitleIndex]} />
            )}
            {subtitleMode === 'fillblank' && video.subtitles[currentSubtitleIndex] && (
              <FillBlankMode subtitle={video.subtitles[currentSubtitleIndex]} />
            )}
            {subtitleMode === 'reading' && (
              <ReadingMode
                subtitles={video.subtitles}
                selectedWord={selectedWord}
                onWordClick={handleWordClick}
              />
            )}
            {subtitleMode === 'translate' && (
              <TranslateMode subtitles={video.subtitles} />
            )}
            {subtitleMode === 'flashcard' && (
              <FlashcardMode subtitles={video.subtitles} />
            )}

            {/* Default subtitle/quiz panel */}
            {(subtitleMode === 'bilingual' || subtitleMode === 'english' || subtitleMode === 'chinese') && (
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
                    showEnglishOnly={showEnglishOnly}
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

      {/* Bottom progress bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-navy-elevated border-t border-white/10 px-4 py-2">
        <div className="h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = ((e.clientX - rect.left) / rect.width) * 100;
          const duration = video?.subtitles[video.subtitles.length - 1]?.end_time || 1;
          seekTo((percent / 100) * duration);
        }}>
          <div className="h-full bg-coral rounded-full transition-all duration-150" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-white/40 font-mono">{currentSubtitleIndex + 1} / {video.subtitles.length}</span>
          <span className="text-xs text-white/40 font-mono">{Math.round(progress)}%</span>
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
