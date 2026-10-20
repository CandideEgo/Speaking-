"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { watchSentenceHref } from "@/lib/watchEntry";
import { toastApiError } from "@/lib/errors";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import type { Paginated, VocabularyWord } from "@/types";
interface SavedSentence {
  id: string;
  subtitle_id: string;
  video_id: string;
  title: string;
  text_en: string;
  text_zh: string | null;
  start_time: number | null;
  available: boolean;
}
export function SavedLearningContent() {
  const sentenceFetcher = useCallback(
    (page: number) =>
      api<Paginated<SavedSentence>>(
        `/api/v1/discovery/sentence-favorites?page=${page}&page_size=20`
      ),
    []
  );
  const wordFetcher = useCallback(
    (page: number) =>
      api<Paginated<VocabularyWord>>(`/api/v1/vocabulary?page=${page}&page_size=20`),
    []
  );
  const sentences = usePaginatedList({ fetcher: sentenceFetcher, mode: "append" });
  const words = usePaginatedList({ fetcher: wordFetcher, mode: "append" });
  const [remove, setRemove] = useState<VocabularyWord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function unsave(sentence: SavedSentence) {
    setBusy(sentence.id);
    try {
      await api(`/api/v1/discovery/sentence-favorites/${sentence.subtitle_id}`, {
        method: "DELETE",
      });
      sentences.reload();
    } catch (err) {
      toastApiError(err, "取消收藏失败");
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <section className="user-section mt-8" aria-label="收藏的句子">
        <h2 className="user-section-title">
          收藏的句子 <span className="text-meta text-muted font-normal">{sentences.total} 句</span>
        </h2>
        {sentences.error ? (
          <ErrorState title={sentences.error} onRetry={sentences.reload} />
        ) : (
          <>
            <ul className="divide-y divide-hairline">
              {sentences.items.map((s) => (
                <li key={s.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {s.available ? (
                        <Link
                          href={watchSentenceHref(
                            s.video_id,
                            { from: "favorites" },
                            {
                              subtitleId: s.subtitle_id,
                              startTime: s.start_time,
                            }
                          )}
                          className="text-copy leading-relaxed"
                        >
                          {s.text_en}
                        </Link>
                      ) : (
                        <p className="text-copy text-muted">{s.text_en}</p>
                      )}
                      {s.text_zh && <p className="mt-2 text-copy text-muted">{s.text_zh}</p>}
                      <p className="mt-2 text-meta text-muted">{s.title}</p>
                    </div>
                    <Button
                      variant="text"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void unsave(s)}
                    >
                      取消收藏
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {!sentences.items.length && (
              <p className="text-copy text-muted py-4">
                {sentences.loading
                  ? "正在读取句子…"
                  : "还没有收藏句子。在观看页点击「收藏这句」，下次就能直接回看。"}
              </p>
            )}
            {sentences.hasMore && (
              <Button variant="outline" onClick={sentences.loadMore} disabled={sentences.loading}>
                加载更多句子
              </Button>
            )}
          </>
        )}
      </section>
      <section className="user-section" aria-label="收藏的词">
        <h2 className="user-section-title">
          收藏的词{" "}
          <span className="text-meta text-muted font-normal">生词本 {words.total} 个词</span>
        </h2>
        <p className="text-meta text-muted mb-4">
          这里与生词本共用词条，移除会同时删除该词的复习进度。
        </p>
        {words.error ? (
          <ErrorState title={words.error} onRetry={words.reload} />
        ) : (
          <>
            <ul className="divide-y divide-hairline">
              {words.items.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <Link
                      href="/vocabulary?tab=library&sub=words"
                      className="text-copy font-semibold"
                    >
                      {w.word}
                    </Link>
                    <p className="text-meta text-muted mt-1">
                      {w.translation || w.definition || "释义待补充"}
                    </p>
                  </div>
                  <Button variant="text" size="sm" onClick={() => setRemove(w)}>
                    移出生词本
                  </Button>
                </li>
              ))}
            </ul>
            {!words.items.length && (
              <p className="text-copy text-muted py-4">
                {words.loading ? "正在读取生词…" : "还没有生词。看视频时点一个单词，就可以收进来。"}
              </p>
            )}
            {words.hasMore && (
              <Button variant="outline" disabled={words.loading} onClick={words.loadMore}>
                加载更多词
              </Button>
            )}
          </>
        )}
      </section>
      <ConfirmDialog
        open={remove !== null}
        title={`移除 ${remove?.word || "这个词"}？`}
        message="这会将它移出生词本和关联词单，并删除该词的复习进度。"
        confirmLabel="移除生词"
        tone="danger"
        busy={busy !== null}
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          if (!remove) return;
          setBusy(remove.id);
          try {
            await api(`/api/v1/vocabulary/${remove.id}`, { method: "DELETE" });
            setRemove(null);
            words.reload();
          } catch (err) {
            toastApiError(err, "移除生词失败");
          } finally {
            setBusy(null);
          }
        }}
      />
    </>
  );
}
