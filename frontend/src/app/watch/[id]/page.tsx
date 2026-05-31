'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, getToken, mediaUrl } from '@/lib/api';
import type { VideoWithSubtitles } from '@/types';
import YouTubePlayer, { type YouTubePlayerHandle } from '@/components/YouTubePlayer';
import SubtitleOverlay from '@/components/SubtitleOverlay';
import { cn, formatTime } from '@/lib/utils';
import {
  ArrowLeft,
  Languages,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  X,
  Zap,
  Play,
  Loader2,
} from 'lucide-react';

type SpeakingState = 'idle' | 'listening' | 'reviewing' | 'submitting' | 'result';

interface SpeakingResult {
  accuracy: number;
  fluency: number;
  completeness: number;
  feedback: string;
  transcript: string;
}

function ScoreRing({ label, value, color }: { label: string; value: number; color: string }) {
  const r = 22;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center">
        <svg width="56" height="56" className="-rotate-90">
          <circle cx="28" cy="28" r={r} fill="none" stroke="#374151" strokeWidth="5" />
          <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <span className="absolute text-xs font-bold text-white">{value}%</span>
      </div>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [video, setVideo] = useState<VideoWithSubtitles | null>(null);
  const [playbackMode, setPlaybackMode] = useState<'local' | 'youtube' | 'loading'>('loading');
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(0);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordMeaning, setWordMeaning] = useState<string | null>(null);
  const [showEnglishOnly, setShowEnglishOnly] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [speakingState, setSpeakingState] = useState<SpeakingState>('idle');
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [speakingResult, setSpeakingResult] = useState<SpeakingResult | null>(null);
  const [showMobileSubtitles, setShowMobileSubtitles] = useState(false);

  const activeSubtitle = video?.subtitles.find((s) => s.id === activeSubtitleId);

  useEffect(() => {
    api<VideoWithSubtitles>(`/api/v1/videos/${id}`)
      .then((v) => {
        setVideo(v);
        if (v.status === 'ready' && v.video_url_720p) {
          setPlaybackMode('local');
        } else if ((v.status === 'ready_subtitles' || v.status === 'processing') && v.youtube_video_id) {
          setPlaybackMode('youtube');
        } else if (v.status === 'ready') {
          setPlaybackMode('local');
        } else {
          setPlaybackMode('loading');
        }
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    const el = document.getElementById(`subtitle-${currentSubtitleIndex}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentSubtitleIndex]);

  useEffect(() => {
    if (playbackMode !== 'youtube' || video?.status !== 'ready_subtitles') return;
    const interval = setInterval(async () => {
      try {
        const status = await api<{ status: string; video_url_720p: string | null }>(
          `/api/v1/videos/${id}/status`
        );
        if (status.status === 'ready' && status.video_url_720p) {
          const currentTime = playerRef.current?.getCurrentTime?.() ?? 0;
          const fullVideo = await api<VideoWithSubtitles>(`/api/v1/videos/${id}`);
          setVideo(fullVideo);
          setPlaybackMode('local');
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = currentTime;
              videoRef.current.play();
            }
          }, 500);
          toast.success('High-quality ad-free video ready!');
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [playbackMode, video?.status, video?.id, id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (playbackMode === 'youtube') {
            playerRef.current?.isPaused() ? playerRef.current?.play() : playerRef.current?.pause();
          } else {
            videoRef.current?.paused ? videoRef.current?.play() : videoRef.current?.pause();
          }
          break;
        case 'ArrowLeft':
          if (playbackMode === 'youtube') {
            playerRef.current?.seekTo(Math.max(0, (playerRef.current?.getCurrentTime?.() ?? 0) - 5));
          } else if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          }
          break;
        case 'ArrowRight':
          if (playbackMode === 'youtube') {
            playerRef.current?.seekTo((playerRef.current?.getCurrentTime?.() ?? 0) + 5);
          } else if (videoRef.current) {
            videoRef.current.currentTime += 5;
          }
          break;
        case 'ArrowUp':
          if (video?.subtitles) {
            const prev = Math.max(0, currentSubtitleIndex - 1);
            setCurrentSubtitleIndex(prev);
            seekTo(video.subtitles[prev].start_time);
          }
          break;
        case 'ArrowDown':
          if (video?.subtitles) {
            const next = Math.min(video.subtitles.length - 1, currentSubtitleIndex + 1);
            setCurrentSubtitleIndex(next);
            seekTo(video.subtitles[next].start_time);
          }
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [video, currentSubtitleIndex, playbackMode]);

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
    if (selectedWord === clean) { setSelectedWord(null); setWordMeaning(null); return; }
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
    } catch {}
  }

  function requireAuth(): boolean {
    if (!getToken()) {
      router.push('/login');
      return false;
    }
    return true;
  }

  function startSpeaking(subtitleId: string) {
    if (!requireAuth()) return;
    setActiveSubtitleId(subtitleId);
    setSpeakingState('idle');
    setSpeakingResult(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }

  function stopSpeaking() {
    setActiveSubtitleId(null);
    setSpeakingState('idle');
    setSpeakingResult(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(blob));
        setSpeakingState('reviewing');
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      setSpeakingState('listening');
    } catch { toast.error('无法访问麦克风，请检查权限'); }
  }

  function stopRecording() { mediaRecorderRef.current?.stop(); }

  async function submitForFeedback() {
    if (!audioUrl || !activeSubtitleId) return;
    setSpeakingState('submitting');
    try {
      const blob = await fetch(audioUrl).then((r) => r.blob());
      const form = new FormData();
      form.append('audio', blob, 'recording.webm');
      form.append('subtitle_id', activeSubtitleId);
      const result = await api<SpeakingResult>('/api/v1/speaking/practice', {
        method: 'POST', body: form, headers: {} as Record<string, string>,
      });
      setSpeakingResult(result);
      setSpeakingState('result');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
      setSpeakingState('reviewing');
    }
  }

  function reRecord() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setSpeakingState('idle');
    setSpeakingResult(null);
  }

  function nextSubtitle() {
    if (!video?.subtitles) return;
    const currentIdx = video.subtitles.findIndex((s) => s.id === activeSubtitleId);
    if (currentIdx >= 0 && currentIdx < video.subtitles.length - 1) {
      const next = video.subtitles[currentIdx + 1];
      setCurrentSubtitleIndex(currentIdx + 1);
      seekTo(next.start_time);
      startSpeaking(next.id);
    }
  }

  if (!video) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 size={24} className="animate-spin text-brand-600" />
      </main>
    );
  }

  if (video.status === 'processing' && video.subtitles.length === 0 && !video.youtube_video_id) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="mt-4 text-slate-600">Preparing subtitles, about 5-10 seconds...</p>
        </div>
      </main>
    );
  }

  if (video.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600">Processing failed</p>
          <p className="mt-1 text-sm text-red-500">{video.error_message || 'Unknown error'}</p>
          <button onClick={() => router.push('/')} className="mt-4 text-sm text-brand-600 hover:underline">
            Back to home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <button onClick={() => router.push('/')} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700">
          <ArrowLeft size={16} />
        </button>
        <h1 className="flex-1 truncate text-sm font-medium text-slate-900">{video.title}</h1>
        <button
          onClick={() => setShowEnglishOnly(!showEnglishOnly)}
          className={cn('flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium border', showEnglishOnly ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}
        >
          <Languages size={14} /> {showEnglishOnly ? 'English' : 'Bilingual'}
        </button>
        <button
          onClick={() => setShowMobileSubtitles(!showMobileSubtitles)}
          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
        >
          <Languages size={14} />
        </button>
        <button onClick={() => setShowShortcuts(!showShortcuts)} className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <Zap size={14} />
        </button>
      </div>
      {showShortcuts && (
        <div className="absolute right-4 top-16 z-20 w-56 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">Keyboard Shortcuts</p>
            <button onClick={() => setShowShortcuts(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <p><kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono">Space</kbd> Play/Pause</p>
            <p><kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono">&larr;&rarr;</kbd> Seek 5s</p>
            <p><kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono">&uarr;&darr;</kbd> Prev/Next line</p>
          </div>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-full flex-col bg-black lg:w-3/5">
          <div className="flex flex-1 items-center justify-center">
            {playbackMode === 'youtube' && video.youtube_video_id ? (
              <div className="relative w-full max-w-4xl">
                <YouTubePlayer
                  ref={playerRef}
                  videoId={video.youtube_video_id}
                  onTimeUpdate={(t) => {
                    if (!video?.subtitles) return;
                    const idx = video.subtitles.findIndex(
                      (s) => t >= s.start_time && t <= s.end_time
                    );
                    if (idx !== -1) setCurrentSubtitleIndex(idx);
                  }}
                />
                <SubtitleOverlay
                  subtitle={video.subtitles?.[currentSubtitleIndex] ?? null}
                  showEnglishOnly={showEnglishOnly}
                  onWordClick={handleWordClick}
                  selectedWord={selectedWord}
                  onStartSpeaking={startSpeaking}
                />
              </div>
            ) : playbackMode === 'local' && video.video_url_720p ? (
              <video ref={videoRef} src={mediaUrl(video.video_url_720p)} controls className="max-h-full max-w-full"
                onTimeUpdate={(e) => {
                  const t = e.currentTarget.currentTime;
                  const idx = video.subtitles.findIndex((s) => t >= s.start_time && t <= s.end_time);
                  if (idx !== -1) setCurrentSubtitleIndex(idx);
                }}
              />
            ) : (
              <div className="text-center">
                <Play size={40} className="mx-auto text-slate-600" />
                <p className="mt-3 text-sm text-slate-500">Video not ready</p>
              </div>
            )}
          </div>
          {activeSubtitleId && activeSubtitle && (
            <div className="border-t border-slate-700 bg-slate-900 px-4 py-4">
              <div className="flex items-center gap-3">
                <button onClick={stopSpeaking} className="text-slate-400 hover:text-white"><X size={18} /></button>
                <p className="flex-1 text-sm text-slate-300 truncate">{activeSubtitle.text_en}</p>
                {speakingState === 'idle' && (
                  <button onClick={startRecording} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                    <Mic size={16} /> Record
                  </button>
                )}
                {speakingState === 'listening' && (
                  <button onClick={stopRecording} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white animate-pulse">
                    <MicOff size={16} /> Stop
                  </button>
                )}
                {speakingState === 'reviewing' && (
                  <div className="flex gap-2">
                    <button onClick={reRecord} className="inline-flex items-center gap-1 rounded-lg border border-slate-500 px-3 py-2 text-sm text-slate-300 hover:text-white"><RotateCcw size={14} /> Retry</button>
                    <button onClick={submitForFeedback} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"><Send size={14} /> Submit</button>
                  </div>
                )}
              </div>
              {audioUrl && (
                <div className="mt-3"><p className="mb-1 text-xs text-slate-400">Your recording:</p><audio src={audioUrl} controls className="h-8 w-full max-w-md" /></div>
              )}
              {speakingState === 'submitting' && <p className="mt-3 text-sm text-slate-400">AI scoring...</p>}
              {speakingResult && speakingState === 'result' && (
                <div className="mt-3 rounded-lg bg-slate-800 p-4">
                  <div className="flex justify-center gap-5">
                    <ScoreRing label="准确度" value={speakingResult.accuracy} color="#10b981" />
                    <ScoreRing label="流利度" value={speakingResult.fluency} color="#3b82f6" />
                    <ScoreRing label="完整度" value={speakingResult.completeness} color="#f59e0b" />
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{speakingResult.feedback}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={reRecord} className="flex-1 rounded bg-slate-700 py-1.5 text-xs text-white hover:bg-slate-600">再练一次</button>
                    <button onClick={nextSubtitle} className="flex-1 rounded bg-brand-600 py-1.5 text-xs text-white hover:bg-brand-700">下一句</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className={cn(
          "w-full overflow-y-auto border-l border-slate-200 bg-white lg:w-2/5",
          "fixed bottom-0 left-0 right-0 z-20 max-h-[45vh] rounded-t-xl shadow-xl",
          "lg:static lg:max-h-none lg:rounded-none lg:shadow-none",
          !showMobileSubtitles && "hidden lg:block"
        )}>
          <div className="divide-y divide-slate-100">
            {video.subtitles.map((sub, i) => {
              const isActive = i === currentSubtitleIndex;
              return (
                <div key={sub.id} id={`subtitle-${i}`} className={cn('transition-colors', isActive && 'bg-brand-50 border-l-2 border-l-brand-500')}>
                  <button onClick={() => { setCurrentSubtitleIndex(i); seekTo(sub.start_time); }} className="w-full px-4 py-3 text-left hover:bg-slate-50">
                    <p className="text-xs text-slate-400">{formatTime(sub.start_time)}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-900">
                      {sub.text_en.split(' ').map((word, wi) => (
                        <span key={wi} onClick={(e) => { e.stopPropagation(); handleWordClick(word); }}
                          className={cn('cursor-pointer rounded hover:bg-brand-100', selectedWord === word.replace(/[.,!?;:'"]/g, '') && 'bg-brand-200')}>
                          {word}{' '}
                        </span>
                      ))}
                    </p>
                    {!showEnglishOnly && sub.text_zh && <p className="mt-1 text-sm text-slate-500">{sub.text_zh}</p>}
                    {sub.grammar_note && <p className="mt-1 text-xs text-amber-600">Tip: {sub.grammar_note}</p>}
                  </button>
                  <div className="px-4 pb-2">
                    <button onClick={() => startSpeaking(sub.id)} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                      <Mic size={12} /> Practice this line
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {selectedWord && (
        <div className="fixed bottom-4 right-4 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl z-30">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">{selectedWord}</h3>
            <button onClick={() => { setSelectedWord(null); setWordMeaning(null); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <button onClick={() => { const u = new SpeechSynthesisUtterance(selectedWord); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u); }}
            className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">Speak</button>
          {wordMeaning ? <p className="mt-2 text-sm text-slate-700">{wordMeaning}</p> : <p className="mt-2 text-xs text-slate-400">Loading...</p>}
        </div>
      )}
    </main>
  );
}