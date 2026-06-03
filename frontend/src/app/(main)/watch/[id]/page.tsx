'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, getToken, mediaUrl } from '@/lib/api';
import type { VideoWithSubtitles, QuizQuestion } from '@/types';
import YouTubePlayer, { type YouTubePlayerHandle } from '@/components/YouTubePlayer';
import { cn, formatTime } from '@/lib/utils';
import {
  ArrowLeft, Languages, Mic, MicOff, RotateCcw, Send, X, Zap, Play, Loader2, BookOpen, Check, BookmarkPlus,
} from 'lucide-react';

type SpeakingState = 'idle' | 'listening' | 'reviewing' | 'submitting' | 'result';

interface SpeakingResult { accuracy: number; fluency: number; completeness: number; feedback: string; transcript: string; }

function ScoreRing({ label, value, color }: { label: string; value: number; color: string }) {
  const r = 22; const circumference = 2 * Math.PI * r; const offset = circumference * (1 - value / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center">
        <svg width="56" height="56" className="-rotate-90">
          <circle cx="28" cy="28" r={r} fill="none" stroke="#374151" strokeWidth="5" />
          <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
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
  const [panelTab, setPanelTab] = useState<'subtitles' | 'quiz'>('subtitles');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);

  const activeSubtitle = video?.subtitles.find((s) => s.id === activeSubtitleId);

  useEffect(() => {
    api<VideoWithSubtitles>(`/api/v1/videos/${id}`).then((v) => {
      setVideo(v);
      if (v.status === 'ready' && v.video_url_720p) setPlaybackMode('local');
      else if (v.status === 'ready' && v.youtube_video_id && !v.video_url_720p) setPlaybackMode('youtube');
      else if ((v.status === 'ready_subtitles' || v.status === 'processing') && v.youtube_video_id) setPlaybackMode('youtube');
      else setPlaybackMode('loading');
    }).catch(() => toast.error('加载视频失败'));
  }, [id]);

  useEffect(() => { const el = document.getElementById(`subtitle-${currentSubtitleIndex}`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [currentSubtitleIndex]);
  useEffect(() => { api<{ quiz: QuizQuestion[] }>(`/api/v1/videos/${id}/quiz`).then((data) => setQuizQuestions(data.quiz || [])).catch(() => {}); }, [id]);

  function handleQuizAnswer(qi: number, a: string) { setQuizAnswers((prev) => ({ ...prev, [qi]: a })); }

  async function submitQuiz() {
    const correct = quizQuestions.filter((q, i) => { const ua = (quizAnswers[i] || '').trim().toLowerCase(); return ua === q.answer.trim().toLowerCase(); }).length;
    const score = Math.round((correct / quizQuestions.length) * 100);
    setQuizScore(score); setQuizSubmitted(true);
    try { const form = new FormData(); form.append('score', String(score)); await api(`/api/v1/videos/${id}/quiz/submit`, { method: 'POST', body: form, headers: {} as Record<string, string> }); } catch {}
  }

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
        case ' ': e.preventDefault(); playbackMode === 'youtube' ? (playerRef.current?.isPaused() ? playerRef.current?.play() : playerRef.current?.pause()) : (videoRef.current?.paused ? videoRef.current?.play() : videoRef.current?.pause()); break;
        case 'ArrowLeft': playbackMode === 'youtube' ? playerRef.current?.seekTo(Math.max(0, (playerRef.current?.getCurrentTime?.() ?? 0) - 5)) : videoRef.current && (videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)); break;
        case 'ArrowRight': playbackMode === 'youtube' ? playerRef.current?.seekTo((playerRef.current?.getCurrentTime?.() ?? 0) + 5) : videoRef.current && (videoRef.current.currentTime += 5); break;
        case 'ArrowUp': if (video?.subtitles) { const p = Math.max(0, currentSubtitleIndex - 1); setCurrentSubtitleIndex(p); seekTo(video.subtitles[p].start_time); } break;
        case 'ArrowDown': if (video?.subtitles) { const n = Math.min(video.subtitles.length - 1, currentSubtitleIndex + 1); setCurrentSubtitleIndex(n); seekTo(video.subtitles[n].start_time); } break;
      }
    }
    window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey);
  }, [video, currentSubtitleIndex, playbackMode]);

  function seekTo(time: number) { if (playbackMode === 'youtube') { playerRef.current?.seekTo(time); playerRef.current?.play(); } else if (videoRef.current) { videoRef.current.currentTime = time; videoRef.current.play(); } }

  async function handleWordClick(word: string) {
    const clean = word.replace(/[.,!?;:'"]/g, ''); if (selectedWord === clean) { setSelectedWord(null); setWordMeaning(null); return; }
    setSelectedWord(clean); setWordMeaning(null);
    const u = new SpeechSynthesisUtterance(clean); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u);
    try { const ctx = video?.subtitles.find((s) => s.text_en.includes(clean)); if (ctx) { const res = await api<{ meaning: string }>(`/api/v1/ai/word-lookup?word=${encodeURIComponent(clean)}&sentence=${encodeURIComponent(ctx.text_en)}`); setWordMeaning(res.meaning); } }
    catch { setWordMeaning('单词查询需要 Pro 订阅。'); }
  }

  async function saveToVocabulary() { if (!selectedWord || !requireAuth()) return; const ctx = video?.subtitles.find((s) => s.text_en.includes(selectedWord)); try { const params = new URLSearchParams({ word: selectedWord }); if (ctx?.text_en) params.set('context_sentence', ctx.text_en); if (video?.id) params.set('video_id', video.id); await api(`/api/v1/vocabulary?${params.toString()}`, { method: 'POST' }); toast.success(`"${selectedWord}" 已保存到词汇本`); } catch { toast.error('保存失败'); } }

  function requireAuth(): boolean { if (!getToken()) { router.push('/login'); return false; } return true; }

  function startSpeaking(sid: string) { if (!requireAuth()) return; setActiveSubtitleId(sid); setSpeakingState('idle'); setSpeakingResult(null); if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
  function stopSpeaking() { setActiveSubtitleId(null); setSpeakingState('idle'); setSpeakingResult(null); if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(null); }

  async function startRecording() { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const r = new MediaRecorder(stream, { mimeType: 'audio/webm' }); mediaRecorderRef.current = r; chunksRef.current = []; r.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); }; r.onstop = () => { setAudioUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: 'audio/webm' }))); setSpeakingState('reviewing'); stream.getTracks().forEach((t) => t.stop()); }; r.start(); setSpeakingState('listening'); } catch { toast.error('无法访问麦克风，请检查权限'); } }
  function stopRecording() { mediaRecorderRef.current?.stop(); }

  async function submitForFeedback() { if (!audioUrl || !activeSubtitleId) return; setSpeakingState('submitting'); try { const blob = await fetch(audioUrl).then((r) => r.blob()); const form = new FormData(); form.append('audio', blob, 'recording.webm'); form.append('subtitle_id', activeSubtitleId); const result = await api<SpeakingResult>('/api/v1/speaking/practice', { method: 'POST', body: form, headers: {} as Record<string, string> }); setSpeakingResult(result); setSpeakingState('result'); } catch (err) { toast.error(err instanceof Error ? err.message : '提交失败'); setSpeakingState('reviewing'); } }
  function reRecord() { if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(null); setSpeakingState('idle'); setSpeakingResult(null); }
  function nextSubtitle() { if (!video?.subtitles) return; const idx = video.subtitles.findIndex((s) => s.id === activeSubtitleId); if (idx >= 0 && idx < video.subtitles.length - 1) { const n = video.subtitles[idx + 1]; setCurrentSubtitleIndex(idx + 1); seekTo(n.start_time); startSpeaking(n.id); } }

  if (!video) return <main className="flex min-h-screen items-center justify-center bg-canvas"><Loader2 size={24} className="animate-spin text-coral" /></main>;
  if (video.status === 'processing' && video.subtitles.length === 0 && !video.youtube_video_id) return <main className="flex min-h-screen items-center justify-center bg-canvas"><div className="text-center"><Loader2 size={32} className="mx-auto animate-spin text-coral" /><p className="mt-4 text-muted-foreground">正在准备字幕，约 5-10 秒...</p></div></main>;
  if (video.status === 'error') return <main className="flex min-h-screen items-center justify-center bg-canvas"><div className="text-center"><p className="text-muted-foreground">处理失败</p><p className="mt-1 text-sm text-red-500">{video.error_message || '未知错误'}</p><button onClick={() => router.push('/')} className="mt-4 text-sm text-coral hover:underline">返回首页</button></div></main>;

  return (
    <main className="flex h-full flex-col bg-navy">
      <div className="flex items-center gap-3 border-b border-white/10 bg-navy px-4 py-2.5">
        <button onClick={() => router.push('/')} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
        <h1 className="flex-1 truncate text-sm font-medium text-white">{video.title}</h1>
        <button onClick={() => setShowEnglishOnly(!showEnglishOnly)} className={cn('flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium border transition-colors', showEnglishOnly ? 'bg-coral/20 text-coral border-coral/30' : 'border-white/10 text-white/60 hover:text-white hover:border-white/20')}><Languages size={14} /> {showEnglishOnly ? 'English' : '双语'}</button>
        <button onClick={() => setShowMobileSubtitles(!showMobileSubtitles)} className="rounded-md px-2 py-1 text-xs text-white/40 hover:text-white lg:hidden"><Languages size={14} /></button>
        <button onClick={() => setShowShortcuts(!showShortcuts)} className="rounded-md px-2 py-1 text-xs text-white/40 hover:text-white"><Zap size={14} /></button>
      </div>

      {showShortcuts && (
        <div className="absolute right-4 top-16 z-20 w-56 rounded-lg border border-white/10 bg-navy-elevated p-4 shadow-xl">
          <div className="flex items-center justify-between mb-2"><p className="text-xs font-semibold text-white">快捷键</p><button onClick={() => setShowShortcuts(false)} className="text-white/40 hover:text-white"><X size={14} /></button></div>
          <div className="space-y-1.5 text-xs text-white/50">
            <p><kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-white/70">Space</kbd> 播放/暂停</p>
            <p><kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-white/70">&larr;&rarr;</kbd> 快进/快退 5 秒</p>
            <p><kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-white/70">&uarr;&darr;</kbd> 上一句/下一句</p>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-shrink-0 bg-black">
            <div className="mx-auto max-w-4xl">
              {playbackMode === 'youtube' && video.youtube_video_id ? (
                <YouTubePlayer ref={playerRef} videoId={video.youtube_video_id} onTimeUpdate={(t) => { if (!video?.subtitles) return; const idx = video.subtitles.findIndex((s) => t >= s.start_time && t <= s.end_time); if (idx !== -1) setCurrentSubtitleIndex(idx); }} />
              ) : playbackMode === 'local' && video.video_url_720p ? (
                <video ref={videoRef} src={mediaUrl(video.video_url_720p)} controls className="w-full max-h-[70vh]" onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; const idx = video.subtitles.findIndex((s) => t >= s.start_time && t <= s.end_time); if (idx !== -1) setCurrentSubtitleIndex(idx); }} />
              ) : (
                <div className="flex items-center justify-center py-32"><div className="text-center"><Play size={40} className="mx-auto text-white/30" /><p className="mt-3 text-sm text-white/40">视频未就绪</p></div></div>
              )}
            </div>
            <div className="border-t border-white/10 bg-navy-soft px-6 py-3">
              {video.subtitles?.[currentSubtitleIndex] && (
                <div className="text-center">
                  <p className="text-base leading-relaxed text-white font-medium">
                    {video.subtitles[currentSubtitleIndex].text_en.split(' ').map((word, wi) => { const clean = word.replace(/[.,!?;:'"]/g, ''); return <span key={wi} onClick={() => handleWordClick(word)} className={cn('cursor-pointer rounded hover:bg-coral/20', selectedWord === clean && 'bg-coral/30')}>{word}{' '}</span>; })}
                  </p>
                  {!showEnglishOnly && video.subtitles[currentSubtitleIndex].text_zh && <p className="mt-0.5 text-sm text-white/50">{video.subtitles[currentSubtitleIndex].text_zh}</p>}
                  <button onClick={() => startSpeaking(video.subtitles[currentSubtitleIndex].id)} className="mt-1 inline-flex items-center gap-1 text-xs text-coral hover:underline"><Mic size={12} /> 练习这句</button>
                </div>
              )}
              {video.subtitles?.[currentSubtitleIndex + 1] && (
                <div className="text-center mt-2 pt-2 border-t border-white/5">
                  <p className="text-sm leading-relaxed text-white/30">{video.subtitles[currentSubtitleIndex + 1].text_en}</p>
                  {!showEnglishOnly && video.subtitles[currentSubtitleIndex + 1].text_zh && <p className="mt-0.5 text-xs text-white/20">{video.subtitles[currentSubtitleIndex + 1].text_zh}</p>}
                </div>
              )}
            </div>
            {activeSubtitleId && activeSubtitle && (
              <div className="border-t border-white/10 bg-navy-elevated px-4 py-4">
                <div className="flex items-center gap-3">
                  <button onClick={stopSpeaking} className="text-white/40 hover:text-white"><X size={18} /></button>
                  <p className="flex-1 text-sm text-white/70 truncate">{activeSubtitle.text_en}</p>
                  {speakingState === 'idle' && <button onClick={startRecording} className="btn-primary !py-2 !bg-red-600 hover:!bg-red-700"><Mic size={16} /> 录音</button>}
                  {speakingState === 'listening' && <button onClick={stopRecording} className="btn-primary !py-2 !bg-red-600 hover:!bg-red-700 animate-pulse"><MicOff size={16} /> 停止</button>}
                  {speakingState === 'reviewing' && <div className="flex gap-2"><button onClick={reRecord} className="btn-secondary-dark !py-2 text-sm"><RotateCcw size={14} /> 重录</button><button onClick={submitForFeedback} className="btn-primary !py-2 text-sm"><Send size={14} /> 提交</button></div>}
                </div>
                {audioUrl && <div className="mt-3"><p className="mb-1 text-xs text-white/40">你的录音：</p><audio src={audioUrl} controls className="h-8 w-full max-w-md" /></div>}
                {speakingState === 'submitting' && <p className="mt-3 text-sm text-white/40">AI 评分中...</p>}
                {speakingResult && speakingState === 'result' && (
                  <div className="mt-3 rounded-lg bg-navy p-4">
                    <div className="flex justify-center gap-5">
                      <ScoreRing label="准确度" value={speakingResult.accuracy} color="#5db872" />
                      <ScoreRing label="流利度" value={speakingResult.fluency} color="#5db8a6" />
                      <ScoreRing label="完整度" value={speakingResult.completeness} color="#e8a55a" />
                    </div>
                    <p className="mt-3 text-sm text-white/70">{speakingResult.feedback}</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={reRecord} className="flex-1 btn-secondary-dark !py-2 text-xs justify-center">再练一次</button>
                      <button onClick={nextSubtitle} className="flex-1 btn-primary !py-2 text-xs justify-center">下一句</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={cn("w-full overflow-y-auto border-l border-white/10 bg-navy lg:w-[420px] lg:flex-shrink-0", "fixed bottom-0 left-0 right-0 z-20 max-h-[45vh] rounded-t-xl shadow-xl", "lg:static lg:max-h-none lg:rounded-none lg:shadow-none", !showMobileSubtitles && "hidden lg:block")}>
          <div className="sticky top-0 z-10 flex border-b border-white/10 bg-navy">
            <button onClick={() => setPanelTab('subtitles')} className={cn('flex-1 py-2.5 text-xs font-medium transition-colors', panelTab === 'subtitles' ? 'text-coral border-b-2 border-coral' : 'text-white/40 hover:text-white/70')}><Languages size={14} className="inline mr-1" />字幕</button>
            <button onClick={() => setPanelTab('quiz')} className={cn('flex-1 py-2.5 text-xs font-medium transition-colors', panelTab === 'quiz' ? 'text-coral border-b-2 border-coral' : 'text-white/40 hover:text-white/70')}><BookOpen size={14} className="inline mr-1" />测验{quizQuestions.length > 0 && !quizSubmitted && <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white">{quizQuestions.length}</span>}</button>
          </div>

          {panelTab === 'quiz' && (
            <div className="p-4">
              {quizQuestions.length === 0 ? (
                <div className="py-12 text-center"><BookOpen size={32} className="mx-auto text-white/20" /><p className="mt-3 text-sm text-white/40">{video.status === 'processing' || video.status === 'ready_subtitles' ? '视频处理完成后测验将可用。' : '此视频没有测验。'}</p></div>
              ) : quizSubmitted && quizScore !== null ? (
                <div className="text-center py-8"><div className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-full', quizScore >= 60 ? 'bg-green-500/10' : 'bg-amber-500/10')}><span className={cn('text-2xl font-bold', quizScore >= 60 ? 'text-green-400' : 'text-amber-400')}>{quizScore}%</span></div><p className="mt-3 text-sm font-medium text-white">{quizScore >= 60 ? '太棒了！' : '继续加油！'}</p><p className="mt-1 text-xs text-white/40">{quizQuestions.filter((q, i) => { const ua = (quizAnswers[i] || '').trim().toLowerCase(); return ua === q.answer.trim().toLowerCase(); }).length} / {quizQuestions.length} 正确</p></div>
              ) : (
                <div className="space-y-6">
                  {quizQuestions.map((q, qi) => (
                    <div key={qi} className="rounded-lg border border-white/10 p-3">
                      <p className="text-xs font-medium text-white/80">{qi + 1}. {q.question}</p>
                      {q.type === 'comprehension' && q.options ? (
                        <div className="mt-2 space-y-1.5">
                          {q.options.map((opt, oi) => (
                            <label key={oi} className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors', quizAnswers[qi] === opt ? 'border-coral bg-coral/10 text-coral' : 'border-white/10 hover:bg-white/5 text-white/70')}>
                              <input type="radio" name={`q-${qi}`} value={opt} checked={quizAnswers[qi] === opt} onChange={(e) => handleQuizAnswer(qi, e.target.value)} className="sr-only" />
                              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border text-[10px]', quizAnswers[qi] === opt ? 'border-coral bg-coral text-white' : 'border-white/20')}>{quizAnswers[qi] === opt && <Check size={10} />}</span>{opt}
                            </label>
                          ))}
                        </div>
                      ) : q.type === 'fill_blank' ? (
                        <input type="text" placeholder="输入答案..." value={quizAnswers[qi] || ''} onChange={(e) => handleQuizAnswer(qi, e.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-navy-soft px-3 py-2 text-sm text-white focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20" />
                      ) : (
                        <textarea placeholder="写出你听到的内容..." value={quizAnswers[qi] || ''} onChange={(e) => handleQuizAnswer(qi, e.target.value)} rows={2} className="mt-2 w-full rounded-md border border-white/10 bg-navy-soft px-3 py-2 text-sm text-white focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20" />
                      )}
                    </div>
                  ))}
                  <button onClick={submitQuiz} disabled={Object.keys(quizAnswers).length < quizQuestions.length} className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed">提交测验</button>
                </div>
              )}
            </div>
          )}

          {panelTab === 'subtitles' && (
            <div className="divide-y divide-white/5">
              {video.subtitles.map((sub, i) => { const isActive = i === currentSubtitleIndex; return (
                <div key={sub.id} id={`subtitle-${i}`} className={cn('transition-colors', isActive && 'bg-coral/10 border-l-2 border-l-coral')}>
                  <button onClick={() => { setCurrentSubtitleIndex(i); seekTo(sub.start_time); }} className="w-full px-4 py-3 text-left hover:bg-white/5">
                    <p className="text-xs text-white/30">{formatTime(sub.start_time)}</p>
                    <p className="mt-1 text-sm leading-relaxed text-white/80">{sub.text_en.split(' ').map((word, wi) => <span key={wi} onClick={(e) => { e.stopPropagation(); handleWordClick(word); }} className={cn('cursor-pointer rounded hover:bg-coral/20', selectedWord === word.replace(/[.,!?;:'"]/g, '') && 'bg-coral/30')}>{word}{' '}</span>)}</p>
                    {!showEnglishOnly && sub.text_zh && <p className="mt-1 text-sm text-white/40">{sub.text_zh}</p>}
                    {sub.grammar_note && <p className="mt-1 text-xs text-amber-400/80">提示：{sub.grammar_note}</p>}
                  </button>
                  <div className="px-4 pb-2"><button onClick={() => startSpeaking(sub.id)} className="inline-flex items-center gap-1 text-xs text-coral hover:underline"><Mic size={12} /> 练习这句</button></div>
                </div>
              );})}
            </div>
          )}
        </div>
      </div>

      {selectedWord && (
        <div className="fixed bottom-4 right-4 w-80 rounded-lg border border-white/10 bg-navy-elevated p-4 shadow-xl z-30">
          <div className="flex items-center justify-between"><h3 className="font-display text-xl text-white">{selectedWord}</h3><button onClick={() => { setSelectedWord(null); setWordMeaning(null); }} className="text-white/40 hover:text-white"><X size={16} /></button></div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => { const u = new SpeechSynthesisUtterance(selectedWord); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u); }} className="inline-flex items-center gap-1 text-xs text-coral hover:underline">发音</button>
            <button onClick={saveToVocabulary} className="inline-flex items-center gap-1 rounded bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral hover:bg-coral/20"><BookmarkPlus size={12} /> 收藏</button>
          </div>
          {wordMeaning ? <p className="mt-2 text-sm text-white/70">{wordMeaning}</p> : <p className="mt-2 text-xs text-white/30">加载中...</p>}
        </div>
      )}
    </main>
  );
}