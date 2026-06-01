'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, getToken } from '@/lib/api';
import { BookOpen, Trash2, Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VocabWord {
  id: string;
  word: string;
  context_sentence: string | null;
  review_count: number;
  next_review_at: string | null;
  created_at: string;
}

interface VocabListResponse {
  words: VocabWord[];
  stats: { total: number; due: number };
}

const QUALITY_LABELS = [
  { value: 0, label: '完全忘记', color: 'bg-red-500' },
  { value: 1, label: '有点印象', color: 'bg-orange-500' },
  { value: 2, label: '勉强想起', color: 'bg-amber-500' },
  { value: 3, label: '回想起来了', color: 'bg-lime-500' },
  { value: 4, label: '比较熟悉', color: 'bg-green-500' },
  { value: 5, label: '非常熟悉', color: 'bg-emerald-500' },
];

export default function VocabularyPage() {
  const router = useRouter();
  const [words, setWords] = useState<VocabWord[]>([]);
  const [stats, setStats] = useState({ total: 0, due: 0 });
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(true);
  const [reviewingWord, setReviewingWord] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    loadWords();
  }, [dueOnly]);

  async function loadWords() {
    setLoading(true);
    try {
      const data = await api<VocabListResponse>(
        `/api/v1/vocabulary?due_only=${dueOnly}&limit=50`
      );
      setWords(data.words);
      setStats(data.stats);
    } catch {
      toast.error('Failed to load vocabulary');
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(wordId: string, quality: number) {
    try {
      await api(`/api/v1/vocabulary/${wordId}/review?quality=${quality}`, {
        method: 'POST',
      });
      setReviewingWord(null);
      loadWords();
    } catch {
      toast.error('Failed to record review');
    }
  }

  async function handleDelete(wordId: string) {
    try {
      await api(`/api/v1/vocabulary/${wordId}`, { method: 'DELETE' });
      toast.success('Word removed');
      loadWords();
    } catch {
      toast.error('Failed to remove word');
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="container-page py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">词汇本</h1>
            <p className="mt-1 text-sm text-slate-500">
              {stats.total} words · {stats.due} due for review
            </p>
          </div>
          <button
            onClick={() => setDueOnly(!dueOnly)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium border',
              dueOnly
                ? 'bg-brand-50 text-brand-700 border-brand-200'
                : 'bg-white text-slate-600 border-slate-200'
            )}
          >
            {dueOnly ? 'Due for review' : 'All words'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : words.length === 0 ? (
          <div className="py-20 text-center">
            <BookOpen size={48} className="mx-auto text-slate-300" />
            <p className="mt-4 text-slate-500">
              {dueOnly
                ? 'No words due for review today!'
                : 'Your vocabulary is empty. Click words while watching videos to save them.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {words.map((w) => (
              <div
                key={w.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{w.word}</h3>
                  <button
                    onClick={() => handleDelete(w.id)}
                    className="text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {w.context_sentence && (
                  <p className="mt-1 text-xs italic text-slate-500">
                    &ldquo;{w.context_sentence}&rdquo;
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <RotateCcw size={12} />
                  <span>Reviewed {w.review_count} times</span>
                </div>

                {reviewingWord === w.id ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {QUALITY_LABELS.map((q) => (
                      <button
                        key={q.value}
                        onClick={() => handleReview(w.id, q.value)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-80',
                          q.color
                        )}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => setReviewingWord(w.id)}
                    className="mt-3 inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                  >
                    <Check size={12} /> Review
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
