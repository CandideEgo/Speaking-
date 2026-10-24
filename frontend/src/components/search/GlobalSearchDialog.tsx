"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SearchVideo {
  id: string;
  title: string;
  title_zh?: string | null;
  channel_name?: string | null;
}

interface SearchSubtitle {
  id: string;
  text_en: string;
  text_zh?: string | null;
  start_time: number;
  video: SearchVideo;
}

interface SearchWord {
  lemma: string;
  phonetic?: string | null;
  translation?: string | null;
}

interface SearchChannel {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

interface SearchResponse {
  videos?: { items: SearchVideo[]; has_more: boolean };
  subtitles?: { items: SearchSubtitle[]; has_more: boolean };
  words?: { items: SearchWord[]; has_more: boolean };
  channels?: { items: SearchChannel[]; has_more: boolean };
}

type Result =
  | { kind: "video"; key: string; title: string; hint: string; href: string }
  | { kind: "subtitle"; key: string; title: string; hint: string; href: string }
  | { kind: "word"; key: string; title: string; hint: string; href: string }
  | { kind: "channel"; key: string; title: string; hint: string; href: string };

const GROUP_LABEL: Record<Result["kind"], string> = {
  video: "视频",
  subtitle: "原句",
  word: "单词",
  channel: "频道",
};

function toHref(result: Result): string {
  return result.href;
}

export function GlobalSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);

  const results = useMemo<Result[]>(() => {
    if (!data) return [];
    const out: Result[] = [];
    for (const video of data.videos?.items ?? []) {
      out.push({
        kind: "video",
        key: `v:${video.id}`,
        title: video.title,
        hint: [video.title_zh, video.channel_name].filter(Boolean).join(" · "),
        href: `/watch/${video.id}?from=search`,
      });
    }
    for (const sub of data.subtitles?.items ?? []) {
      out.push({
        kind: "subtitle",
        key: `s:${sub.id}`,
        title: sub.text_en,
        hint: [sub.text_zh, sub.video.title].filter(Boolean).join(" · "),
        href: `/watch/${sub.video.id}?from=search&t=${Math.floor(sub.start_time)}`,
      });
    }
    for (const word of data.words?.items ?? []) {
      out.push({
        kind: "word",
        key: `w:${word.lemma}`,
        title: word.lemma,
        hint: word.translation ?? "",
        href: `/search?q=${encodeURIComponent(word.lemma)}&group=words`,
      });
    }
    for (const channel of data.channels?.items ?? []) {
      out.push({
        kind: "channel",
        key: `c:${channel.id}`,
        title: channel.name,
        hint: channel.description ?? "",
        href: `/channels/${channel.slug}`,
      });
    }
    return out.slice(0, 16);
  }, [data]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      setQuery("");
      setData(null);
      setSelected(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      api<SearchResponse>(
        `/api/v1/discovery/search?q=${encodeURIComponent(trimmed)}&group=all&page_size=4`,
        { signal: controller.signal }
      )
        .then((payload) => {
          if (!controller.signal.aborted) setData(payload);
        })
        .catch(() => {
          if (!controller.signal.aborted) setData(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    setSelected(0);
  }, [results.length]);

  const go = useCallback(
    (result: Result | undefined) => {
      if (!result) return;
      onClose();
      router.push(toHref(result));
    },
    [onClose, router]
  );

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[selected]);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="全局搜索"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="user-search-dialog"
    >
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <Search size={18} className="shrink-0 text-muted" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          type="search"
          aria-label="搜索视频、原句、单词或频道"
          placeholder="搜索视频、原句、单词或频道"
          autoComplete="off"
          spellCheck={false}
          className="h-8 w-full bg-transparent text-copy text-ink placeholder:text-muted focus:outline-none"
        />
        <button
          type="button"
          aria-label="关闭搜索"
          onClick={onClose}
          className="grid min-h-8 min-w-8 place-items-center rounded-sm text-muted hover:bg-surface-card hover:text-ink"
        >
          <X size={17} />
        </button>
      </div>

      <div className="max-h-[min(60vh,32rem)] overflow-y-auto p-2">
        {!query.trim() && (
          <p className="px-3 py-8 text-center text-meta text-muted">
            输入关键词，搜索视频、原句、单词或频道
          </p>
        )}
        {loading && query.trim() && (
          <p className="px-3 py-8 text-center text-meta text-muted">正在搜索…</p>
        )}
        {!loading && query.trim() && results.length === 0 && (
          <p className="px-3 py-8 text-center text-meta text-muted">没有找到相关内容</p>
        )}
        {!loading &&
          results.map((result, index) => (
            <div key={result.key}>
              {(index === 0 || results[index - 1].kind !== result.kind) && (
                <p className="px-3 pt-3 pb-1 text-caption font-semibold tracking-[0.08em] text-muted-soft">
                  {GROUP_LABEL[result.kind]}
                </p>
              )}
              <button
                type="button"
                onClick={() => go(result)}
                onMouseEnter={() => setSelected(index)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-sm px-3 py-2 text-left",
                  index === selected ? "bg-surface-soft" : "hover:bg-surface-soft"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-copy text-ink">{result.title}</span>
                  {result.hint && (
                    <span className="mt-0.5 block truncate text-meta text-muted">
                      {result.hint}
                    </span>
                  )}
                </span>
              </button>
            </div>
          ))}
      </div>

      <div className="flex items-center justify-between border-t border-hairline px-4 py-2 text-caption text-muted">
        <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
        <span>视频 · 原句 · 单词 · 频道</span>
      </div>
    </dialog>
  );
}
