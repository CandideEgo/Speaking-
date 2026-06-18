'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Mic, MicOff, RotateCcw, Send, X } from 'lucide-react';

interface SpeakingResult {
  accuracy: number;
  fluency: number;
  completeness: number;
  feedback: string;
  transcript: string;
}

interface SpeakingPanelProps {
  activeSubtitleId: string;
  activeSubtitleText: string;
  onNextSubtitle: () => void;
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
          <circle
            cx="28" cy="28" r={r}
            fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <span className="absolute text-xs font-bold text-white">{value}%</span>
      </div>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}

export default function SpeakingPanel({
  activeSubtitleId,
  activeSubtitleText,
  onNextSubtitle,
}: SpeakingPanelProps) {
  const [speakingState, setSpeakingState] = useState<'idle' | 'listening' | 'reviewing' | 'submitting' | 'result'>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [speakingResult, setSpeakingResult] = useState<SpeakingResult | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function stopSpeaking() {
    setSpeakingState('idle');
    setSpeakingResult(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = r;
      chunksRef.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      r.onstop = () => {
        setAudioUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: 'audio/webm' })));
        setSpeakingState('reviewing');
        stream.getTracks().forEach((t) => t.stop());
      };
      r.start();
      setSpeakingState('listening');
    } catch {
      toast.error('无法访问麦克风，请检查权限');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function submitForFeedback() {
    if (!audioUrl) return;
    setSpeakingState('submitting');
    try {
      const blob = await fetch(audioUrl).then((r) => r.blob());
      const form = new FormData();
      form.append('audio', blob, 'recording.webm');
      form.append('subtitle_id', activeSubtitleId);
      const result = await api<SpeakingResult>('/api/v1/speaking/practice', {
        method: 'POST',
        body: form,
        headers: {} as Record<string, string>,
      });
      setSpeakingResult(result);
      setSpeakingState('result');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
      setSpeakingState('reviewing');
    }
  }

  function reRecord() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setSpeakingState('idle');
    setSpeakingResult(null);
  }

  return (
    <div className="border-t border-white/10 bg-navy-elevated px-4 py-4">
      <div className="flex items-center gap-3">
        <button onClick={stopSpeaking} className="text-white/40 hover:text-white" aria-label="关闭口语练习">
          <X size={18} />
        </button>
        <p className="flex-1 text-sm text-white/70 truncate">{activeSubtitleText}</p>
        {speakingState === 'idle' && (
          <button onClick={startRecording} className="btn-primary !py-2 !bg-red-600 hover:!bg-red-700">
            <Mic size={16} /> 录音
          </button>
        )}
        {speakingState === 'listening' && (
          <button onClick={stopRecording} className="btn-primary !py-2 !bg-red-600 hover:!bg-red-700 animate-pulse">
            <MicOff size={16} /> 停止
          </button>
        )}
        {speakingState === 'reviewing' && (
          <div className="flex gap-2">
            <button onClick={reRecord} className="btn-secondary-dark !py-2 text-sm">
              <RotateCcw size={14} /> 重录
            </button>
            <button onClick={submitForFeedback} className="btn-primary !py-2 text-sm">
              <Send size={14} /> 提交
            </button>
          </div>
        )}
      </div>

      {audioUrl && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-white/40">你的录音：</p>
          <audio src={audioUrl} controls className="h-8 w-full max-w-md" />
        </div>
      )}

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
            <button onClick={reRecord} className="flex-1 btn-secondary-dark !py-2 text-xs justify-center">
              再练一次
            </button>
            <button onClick={onNextSubtitle} className="flex-1 btn-primary !py-2 text-xs justify-center">
              下一句
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
