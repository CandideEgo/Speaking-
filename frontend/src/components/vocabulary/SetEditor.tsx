"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { Paginated, VocabularyWord, VocabSetDetail } from "@/types";
interface Candidate {
  id: string;
  word: string;
  translation: string | null;
}
export function SetEditor({ detail, onChange }: { detail: VocabSetDetail; onChange: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(detail.title);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open || detail.source_type === "video") return;
    const controller = new AbortController();
    setError(null);
    const timer = setTimeout(() => {
      if (detail.source_type === "exam")
        api<Paginated<{ lemma: string; translation: string | null }>>(
          `/api/v1/discovery/dictionary?exam_level=${detail.exam_level}&q=${encodeURIComponent(query)}&page=${page}`,
          { signal: controller.signal }
        )
          .then((data) => {
            setCandidates(
              data.items.map((w) => ({ id: w.lemma, word: w.lemma, translation: w.translation }))
            );
            setHasMore(data.has_more);
          })
          .catch((err) => {
            if (!controller.signal.aborted)
              setError(err instanceof Error ? err.message : "词库加载失败");
          });
      else
        api<Paginated<VocabularyWord>>(
          `/api/v1/vocabulary?page=${page}&page_size=20&search=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        )
          .then((data) => {
            setCandidates(data.items);
            setHasMore(data.has_more);
          })
          .catch((err) => {
            if (!controller.signal.aborted)
              setError(err instanceof Error ? err.message : "生词加载失败");
          });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, detail.source_type, detail.exam_level, query, page]);
  async function mutate(path: string, method: string, body?: object) {
    setBusy(true);
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      onChange();
      return true;
    } catch (err) {
      toastApiError(err, "词单操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (detail.source_type === "video" || !detail.source_type) return null;
  return (
    <section className="user-section mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "收起词单管理" : "添加词条 / 管理词单"}
        </Button>
        <Button variant="text" onClick={() => setConfirm(true)}>
          删除词单
        </Button>
      </div>
      {open && (
        <div className="mt-5 space-y-5">
          <form
            className="flex max-w-lg gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await mutate(`/api/v1/discovery/sets/${detail.id}`, "PATCH", { name });
            }}
          >
            <label className="sr-only" htmlFor="set-name">
              词单名称
            </label>
            <Input
              id="set-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
            <Button variant="outline" type="submit" disabled={busy || !name.trim()}>
              保存名称
            </Button>
          </form>
          <div className="user-study-layout">
            <div>
              <h3 className="font-semibold mb-3">
                {detail.source_type === "exam" ? "从考试词库选词" : "从我的生词本选词"}
              </h3>
              <Input
                aria-label="筛选可加入的词"
                placeholder="搜一个词"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              {error && (
                <p role="alert" className="mt-3 text-error-text">
                  {error}
                </p>
              )}
              <ul className="divide-y divide-hairline mt-3">
                {candidates.map((word) => (
                  <li key={word.id}>
                    <label className="flex items-center gap-3 py-3 text-copy">
                      <input
                        type="checkbox"
                        checked={selected.includes(word.id)}
                        onChange={() =>
                          setSelected((old) =>
                            old.includes(word.id)
                              ? old.filter((v) => v !== word.id)
                              : [...old, word.id]
                          )
                        }
                      />
                      <span>
                        <strong>{word.word}</strong>
                        <span className="ml-3 text-muted">{word.translation || "释义待补充"}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {!candidates.length && !error && (
                <p className="py-4 text-meta text-muted">
                  没有找到可选词条，可以换个词，或先去视频里收词。
                </p>
              )}
              <div className="flex items-center gap-3 mt-4">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  上一页
                </Button>
                <span className="text-meta">第 {page} 页</span>
                <Button variant="outline" disabled={!hasMore} onClick={() => setPage((v) => v + 1)}>
                  下一页
                </Button>
              </div>
              <Button
                className="mt-4"
                disabled={busy || !selected.length}
                onClick={async () => {
                  if (
                    await mutate(
                      `/api/v1/discovery/sets/${detail.id}/words`,
                      "POST",
                      detail.source_type === "exam"
                        ? { words: selected }
                        : { vocabulary_ids: selected }
                    )
                  ) {
                    setSelected([]);
                    toast.success("已加入词单");
                  }
                }}
              >
                加入所选 {selected.length} 个词
              </Button>
            </div>
            <div>
              <h3 className="font-semibold mb-3">已在词单中</h3>
              <p className="text-meta text-muted mb-3">
                移出只解除词单关联，生词和学习记录会保留。
              </p>
              <ul className="divide-y divide-hairline">
                {detail.words.map((word) => (
                  <li
                    key={word.set_word_id}
                    className="flex items-center justify-between gap-3 py-2 text-copy"
                  >
                    <span>{word.word}</span>
                    <Button
                      variant="text"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          `/api/v1/discovery/sets/${detail.id}/words/${word.set_word_id}`,
                          "DELETE"
                        )
                      }
                    >
                      移出
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title="删除这个词单？"
        message="只删除词单和它的关联，生词、复习进度和学习记录都会保留。"
        tone="danger"
        confirmLabel="删除词单"
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          if (await mutate(`/api/v1/discovery/sets/${detail.id}`, "DELETE"))
            router.replace("/vocabulary/sets");
        }}
      />
    </section>
  );
}
