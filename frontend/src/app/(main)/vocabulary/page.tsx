'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, getToken } from '@/lib/api';
import { BookOpen, Trash2, Check, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VocabWord {
  id: string; word: string; context_sentence: string | null;
  review_count: number; next_review_at: string | null; created_at: string;
}

interface VocabListResponse {
  words: VocabWord[]; stats: { total: number; due: number };
}

const QUALITY_LABELS = [
  { value: 0, label: '完全忘记', color: 'bg-red-500' },
  { value: 1, label: '有点印象', color: 'bg-orange-500' },
  { value: 2, label: '勉强想起', color: 'bg-amber-500' },
  { value: 3, label: '回想起来了', color: 'bg-lime-600' },
  { value: 4, label: '比较熟悉', color: 'bg-green-600' },
  { value: 5, label: '非常熟悉', color: 'bg-emerald-600' },
];

export default function VocabularyPage() {
  const router = useRouter();
  const [words, setWords] = useState<VocabWord[]>([]);
  const [stats, setStats] = useState({ total: 0, due: 0 });
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(true);
  const [reviewingWord, setReviewingWord] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    loadWords();
  }, [dueOnly]);

  async function loadWords() {
    setLoading(true);
    try {
      const data = await api<VocabListResponse>(`/api/v1/vocabulary?due_only=${dueOnly}&limit=50`);
      setWords(data.words); setStats(data.stats);
    } catch { toast.error('加载词汇失败'); }
    finally { setLoading(false); }
  }

  async function handleReview(wordId: string, quality: number) {
    try {
      await api(`/api/v1/vocabulary/${wordId}/review?quality=${quality}`, { method: 'POST' });
      setReviewingWord(null); loadWords();
    } catch { toast.error('复习记录失败'); }
  }

  async function handleDelete(wordId: string) {
    try { await api(`/api/v1/vocabulary/${wordId}`, { method: 'DELETE' }); toast.success('已移除单词'); loadWords(); }
    catch { toast.error('移除失败'); }
  }

  return (
    <main className="min-h-full bg-canvas">
      <section className="border-b border-hairline bg-canvas">
        <div className="container-page py-8 sm:py-12">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 text-coral mb-3">
                <BookOpen size={18} />
                <span className="text-xs font-semibold tracking-caption-wide uppercase">词汇本</span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl font-normal text-ink tracking-display-xl leading-tight">我的词汇</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{stats.total} 个单词 · {stats.due} 个待复习</p>
            </div>
            <button onClick={() => setDueOnly(!dueOnly)}
              className={cn('rounded-md px-4 py-2 text-sm font-medium border transition-colors',
                dueOnly ? 'bg-coral text-white border-coral' : 'bg-canvas text-muted-foreground border-hairline hover:border-coral/30')}>
              {dueOnly ? '待复习' : '全部单词'}
            </button>
          </div>
        </div>
      </section>

      <section className="container-page py-8">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-coral" /></div>
        ) : words.length === 0 ? (
          <div className="py-20 text-center">
            <BookOpen size={48} className="mx-auto text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">{dueOnly ? '今天没有需要复习的单词！' : '词汇本为空。观看视频时点击单词即可收藏。'}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {words.map((w) => (
              <div key={w.id} className="card-outline !p-5">
                <div className="flex items-start justify-between">
                  <h3 className="font-display text-xl text-ink">{w.word}</h3>
                  <button onClick={() => handleDelete(w.id)} className="text-muted-foreground hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                </div>
                {w.context_sentence && <p className="mt-1.5 text-sm italic text-muted-foreground leading-relaxed">&ldquo;{w.context_sentence}&rdquo;</p>}
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><RotateCcw size={12} /><span>已复习 {w.review_count} 次</span></div>
                {reviewingWord === w.id ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {QUALITY_LABELS.map((q) => (
                      <button key={q.value} onClick={() => handleReview(w.id, q.value)}
                        className={cn('rounded-sm px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-80', q.color)}>{q.label}</button>
                    ))}
                  </div>
                ) : (
                  <button onClick={() => setReviewingWord(w.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-cream-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream-strong transition-colors">
                    <Check size={12} /> 复习
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}