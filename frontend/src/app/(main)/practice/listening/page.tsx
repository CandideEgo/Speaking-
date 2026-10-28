"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Headphones } from "lucide-react";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { VideoCard, VideoCardSkeleton } from "@/components/ui/VideoCard";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import type { VideoCard as Video, Paginated } from "@/types";
import type { ListeningRecent, ListeningSession } from "@/types/listening";

export default function ListeningLibrary() {
  const router = useRouter();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [data, setData] = useState<Paginated<{ video: Video; question_count: number }> | null>(
    null
  );
  const [recent, setRecent] = useState<ListeningRecent[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [moreHistory, setMoreHistory] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    api<Paginated<{ video: Video; question_count: number }>>(
      `/api/v1/listening/videos?page=${page}`,
      { signal: controller.signal }
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [page, retry]);
  useEffect(() => {
    const controller = new AbortController();
    setHistoryError(false);
    api<{ items: ListeningRecent[]; has_more: boolean }>(
      `/api/v1/listening/sessions?page=${historyPage}`,
      { signal: controller.signal }
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setRecent(value.items);
          setMoreHistory(value.has_more);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistoryError(true);
      });
    return () => controller.abort();
  }, [historyPage, retry]);
  async function start(videoId: string) {
    if (busy) return;
    setBusy(videoId);
    try {
      const session = await api<ListeningSession>("/api/v1/listening/sessions", {
        method: "POST",
        body: JSON.stringify({ video_id: videoId, count }),
      });
      router.push(`/practice/listening/${session.id}`);
    } catch (e) {
      toastApiError(e, "练习创建失败，请重试");
      setBusy(null);
    }
  }
  return (
    <div className="user-page">
      <PageHeader
        crumb={<Link href="/practice">← 全部练习</Link>}
        title="逐句听力"

        variant="eyebrow"
        actions={
          <label className="flex items-center gap-2 text-meta text-body">
            每组题数
            <Select
              aria-label="每组题数"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-24"
            >
              {[3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} 句
                </option>
              ))}
            </Select>
          </label>
        }
      />
      {historyError ? (
        <ErrorState title="练习记录未能加载" onRetry={() => setRetry((n) => n + 1)} />
      ) : (
        recent.length > 0 && (
          <section className="mb-7 border-y border-hairline py-4" aria-label="最近听力练习">
            <h2 className="mb-3 text-copy font-semibold text-ink">接着上次练</h2>
            <ul className="divide-y divide-hairline">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-copy font-medium text-ink">{s.title}</p>
                    <p className="mt-1 text-caption text-muted">
                      {s.submitted_at
                        ? `答对 ${s.correct_count} / ${s.total} 句`
                        : `已答 ${s.answered} / ${s.total} 句 · 草稿已保存`}
                    </p>
                  </div>
                  <Link
                    href={`/practice/listening/${s.id}`}
                    className="shrink-0 text-meta font-semibold text-brand-700"
                  >
                    {s.submitted_at ? "回看结果" : "继续练习"} →
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-3">
              {historyPage > 1 && (
                <Button variant="text" size="sm" onClick={() => setHistoryPage((n) => n - 1)}>
                  较新记录
                </Button>
              )}
              {moreHistory && (
                <Button variant="text" size="sm" onClick={() => setHistoryPage((n) => n + 1)}>
                  较早记录
                </Button>
              )}
            </div>
          </section>
        )
      )}
      <section aria-label="听力素材">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-title font-semibold text-ink">选一段原声</h2>
          {data && <span className="text-meta text-muted">{data.total} 个素材</span>}
        </div>
        {error ? (
          <ErrorState title={error} onRetry={() => setRetry((n) => n + 1)} />
        ) : !data ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Headphones}
            title="暂时没有听力素材"
            description="已发布的视频有可播放原声和有效字幕后，会出现在这里。"
          />
        ) : (
          <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map(({ video, question_count }) => (
              <article key={video.id} className="min-w-0">
                <VideoCard video={video} variant="poster" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-caption text-muted">
                    {question_count} 句可练 · 每组最多 {Math.min(count, question_count)} 句
                  </span>
                  <Button
                    size="sm"
                    icon={Headphones}
                    loading={busy === video.id}
                    disabled={busy !== null}
                    onClick={() => start(video.id)}
                  >
                    开始听写
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
        {data && (
          <nav aria-label="素材分页" className="mt-6 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => router.push(`/practice/listening?page=${page - 1}`)}
            >
              上一页
            </Button>
            <span className="text-meta tabular-nums text-muted">第 {page} 页</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.has_more}
              onClick={() => router.push(`/practice/listening?page=${page + 1}`)}
            >
              下一页
            </Button>
          </nav>
        )}
      </section>
    </div>
  );
}
