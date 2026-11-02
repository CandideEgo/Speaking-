"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Autocomplete } from "@base-ui/react/autocomplete";
import {
  BookOpen,
  Captions,
  Clock,
  CornerDownLeft,
  Flame,
  Layers,
  Loader2,
  Search,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";

import { ApiError, api } from "@/lib/api";
import { MAIN_NAV, SECONDARY_NAV } from "@/lib/navigation";
import { useOverlayContainer } from "@/hooks/useOverlayContainer";
import { Dialog, DialogBackdrop, DialogPopup, DialogPortal } from "@/components/ui/Dialog";

/**
 * 全站命令面板（⌘K / Ctrl+K / `/`）。
 *
 * 两层能力：
 * - 空查询时是「跳转命令 + 最近搜索 + 热门搜索」；
 * - 输入后是「视频 / 原句 / 单词 / 频道」四组搜索结果 + 搜索页入口。
 *
 * 键盘、焦点与 ARIA 语义交给 Base UI：`Dialog` 负责模态焦点陷阱、滚动锁、
 * 背景 aria-hidden、Escape 与关闭后回焦；`Autocomplete`（inline + 外部过滤）
 * 负责 combobox/listbox、`aria-activedescendant`、↑↓ 回环、Home/End、
 * Enter 激活与结果数播报。这里只做数据装配与视觉。
 *
 * 搜索接口：登录态走 `discovery/search`（四组聚合）；401 时退回公开的
 * `videos/search` + `videos/search/subtitles`，避免未登录时静默显示「没有结果」。
 *
 * 历史与首页搜索页共用 `seeword_search_history`，两处互相可见。
 */

const HISTORY_KEY = "seeword_search_history";
const MAX_HISTORY = 10;
const VISIBLE_HISTORY = 5;

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
  translation?: string | null;
}

interface SearchChannel {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

interface SearchPayload {
  videos?: { items: SearchVideo[]; has_more: boolean };
  subtitles?: { items: SearchSubtitle[]; has_more: boolean };
  words?: { items: SearchWord[]; has_more: boolean };
  channels?: { items: SearchChannel[]; has_more: boolean };
}

interface PublicSubtitleResult {
  video: SearchVideo;
  matching_subtitles: { id: string; text_en: string; start_time: number }[];
}

type CommandKind = "nav" | "history" | "hot" | "video" | "subtitle" | "word" | "channel" | "action";

interface CommandItem {
  key: string;
  label: string;
  hint?: string;
  kind: CommandKind;
  icon: LucideIcon;
  /** 跳转目标；与 `term` 二选一。 */
  href?: string;
  /** 选中后填入输入框的词（历史 / 热搜）。 */
  term?: string;
}

interface CommandGroup {
  value: string;
  label: string;
  items: CommandItem[];
}

const NAV_COMMANDS: CommandItem[] = [...MAIN_NAV, ...SECONDARY_NAV].map((item) => ({
  key: `nav:${item.href}`,
  label: item.label,
  hint: "打开页面",
  kind: "nav",
  icon: item.icon,
  href: item.href,
}));

function readHistory(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string").slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

/** 登录态搜索四组内容；401 时退回两个公开接口（只有视频与原句）。 */
async function fetchSearch(term: string, signal: AbortSignal): Promise<SearchPayload> {
  const query = encodeURIComponent(term);
  try {
    return await api<SearchPayload>(`/api/v1/discovery/search?q=${query}&group=all&page_size=4`, {
      signal,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const [videos, subtitles] = await Promise.all([
      api<SearchVideo[]>(`/api/v1/videos/search?q=${query}&limit=8`, { signal }).catch(() => []),
      api<PublicSubtitleResult[]>(`/api/v1/videos/search/subtitles?q=${query}&limit=8`, {
        signal,
      }).catch(() => []),
    ]);
    return {
      videos: { items: videos, has_more: false },
      subtitles: {
        items: subtitles.flatMap((result) =>
          result.matching_subtitles.slice(0, 2).map((snippet) => ({
            id: snippet.id,
            text_en: snippet.text_en,
            text_zh: null,
            start_time: snippet.start_time,
            video: result.video,
          }))
        ),
        has_more: false,
      },
    };
  }
}

const RESULT_GROUPS: {
  kind: Extract<CommandKind, "video" | "subtitle" | "word" | "channel">;
  label: string;
}[] = [
  { kind: "video", label: "视频" },
  { kind: "subtitle", label: "原句" },
  { kind: "word", label: "单词" },
  { kind: "channel", label: "频道" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const container = useOverlayContainer();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hot, setHot] = useState<string[]>([]);
  const hotRequested = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults(null);
    setLoading(false);
    setFailed(false);
    setHistory(readHistory().slice(0, VISIBLE_HISTORY));
  }, [open]);

  useEffect(() => {
    if (!open || hotRequested.current) return;
    hotRequested.current = true;
    api<{ hot: string[] }>("/api/v1/videos/search/hot")
      .then((payload) => setHot(payload.hot.slice(0, 6)))
      .catch(() => {
        hotRequested.current = false;
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (!term) {
      setResults(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const timer = window.setTimeout(() => {
      fetchSearch(term, controller.signal)
        .then((payload) => {
          if (!controller.signal.aborted) setResults(payload);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults(null);
            setFailed(true);
          }
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

  const groups = useMemo<CommandGroup[]>(() => {
    const term = query.trim();
    if (!term) {
      const emptyGroups: CommandGroup[] = [{ value: "jump", label: "跳转", items: NAV_COMMANDS }];
      if (history.length > 0) {
        emptyGroups.push({
          value: "history",
          label: "最近搜索",
          items: history.map((item) => ({
            key: `history:${item}`,
            label: item,
            hint: "历史记录",
            kind: "history",
            icon: Clock,
            term: item,
          })),
        });
      }
      if (hot.length > 0) {
        emptyGroups.push({
          value: "hot",
          label: "热门搜索",
          items: hot.map((item) => ({
            key: `hot:${item}`,
            label: item,
            hint: "热搜",
            kind: "hot",
            icon: Flame,
            term: item,
          })),
        });
      }
      return emptyGroups;
    }

    const items: CommandItem[] = [];
    for (const video of results?.videos?.items ?? []) {
      items.push({
        key: `video:${video.id}`,
        label: video.title,
        hint: [video.title_zh, video.channel_name].filter(Boolean).join(" · "),
        kind: "video",
        icon: Video,
        href: `/watch/${video.id}?from=search`,
      });
    }
    for (const subtitle of results?.subtitles?.items ?? []) {
      items.push({
        key: `subtitle:${subtitle.id}`,
        label: subtitle.text_en,
        hint: [subtitle.text_zh, subtitle.video.title].filter(Boolean).join(" · "),
        kind: "subtitle",
        icon: Captions,
        href: `/watch/${subtitle.video.id}?from=search&t=${Math.floor(subtitle.start_time)}`,
      });
    }
    for (const word of results?.words?.items ?? []) {
      items.push({
        key: `word:${word.lemma}`,
        label: word.lemma,
        hint: word.translation ?? "查词",
        kind: "word",
        icon: BookOpen,
        href: `/search?q=${encodeURIComponent(word.lemma)}&group=words`,
      });
    }
    for (const channel of results?.channels?.items ?? []) {
      items.push({
        key: `channel:${channel.id}`,
        label: channel.name,
        hint: channel.description ?? "频道",
        kind: "channel",
        icon: Layers,
        href: `/channels/${channel.slug}`,
      });
    }

    if (items.length > 0) {
      items.push({
        key: "search-all",
        label: `查看「${term}」的全部结果`,
        hint: "在搜索页打开",
        kind: "action",
        icon: CornerDownLeft,
        href: `/search?q=${encodeURIComponent(term)}`,
      });
    }

    const grouped: CommandGroup[] = [];
    for (const group of RESULT_GROUPS) {
      const groupItems = items.filter((item) => item.kind === group.kind);
      if (groupItems.length > 0) grouped.push({ ...group, value: group.kind, items: groupItems });
    }
    const actions = items.filter((item) => item.kind === "action");
    if (actions.length > 0) grouped.push({ value: "action", label: "更多", items: actions });
    return grouped;
  }, [query, history, hot, results]);

  const resultCount = groups.reduce(
    (count, group) =>
      count +
      group.items.filter(
        (item) => item.kind !== "nav" && item.kind !== "history" && item.kind !== "hot"
      ).length,
    0
  );

  const rememberQuery = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const next = [trimmed, ...readHistory().filter((item) => item !== trimmed)].slice(
      0,
      MAX_HISTORY
    );
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    setHistory(next.slice(0, VISIBLE_HISTORY));
  }, []);

  const activate = useCallback(
    (item: CommandItem) => {
      if (item.term) {
        setQuery(item.term);
        setResults(null);
        return;
      }
      if (!item.href) return;
      if (item.kind !== "nav") rememberQuery(query);
      onClose();
      router.push(item.href);
    },
    [onClose, query, rememberQuery, router]
  );

  const term = query.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPortal container={container}>
        <DialogBackdrop />
        <DialogPopup
          className="overlay-pop fixed top-[12vh] left-1/2 flex max-h-[min(80dvh,44rem)] w-[min(42rem,calc(100vw-2rem))] origin-top -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-hairline bg-canvas text-ink shadow-lift"
          aria-label="全局搜索"
          initialFocus={inputRef}
        >
          <Autocomplete.Root
            value={query}
            onValueChange={(next) => setQuery(next)}
            items={groups}
            filteredItems={groups}
            filter={null}
            itemToStringValue={(item) => item.label}
            inline
            open
            autoHighlight="always"
            keepHighlight
          >
            <Autocomplete.InputGroup className="flex shrink-0 items-center gap-2 border-b border-hairline px-4 py-1">
              <Search size={18} className="shrink-0 text-muted" aria-hidden />
              <Autocomplete.Input
                ref={inputRef}
                className="h-11 w-full bg-transparent text-copy text-ink placeholder:text-muted focus:outline-none"
                aria-label="搜索视频、原句、单词或频道"
                placeholder="搜索视频、原句、单词或频道"
                autoComplete="off"
                spellCheck={false}
              />
              {loading && (
                <Loader2
                  size={16}
                  className="shrink-0 animate-spin text-muted motion-reduce:animate-none"
                  aria-hidden
                />
              )}
              <button
                type="button"
                aria-label="关闭搜索"
                onClick={onClose}
                className="grid min-h-8 min-w-8 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface-soft hover:text-ink"
              >
                <X size={17} />
              </button>
            </Autocomplete.InputGroup>

            <Autocomplete.Status className="sr-only">
              {loading ? "正在搜索" : term ? `找到 ${resultCount} 条结果` : ""}
            </Autocomplete.Status>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              <Autocomplete.Empty>
                <div className="px-3 py-8 text-center">
                  {loading ? (
                    <p className="text-meta text-muted">正在搜索…</p>
                  ) : failed ? (
                    <>
                      <p className="text-meta text-body">搜索失败，请稍后重试</p>
                      <p className="mt-1 text-caption text-muted">检查网络后再试一次。</p>
                    </>
                  ) : (
                    <>
                      <p className="text-meta text-body">没有找到「{term}」</p>
                      <p className="mt-1 text-caption text-muted">
                        试试更短的词，或者直接搜中文释义。
                      </p>
                    </>
                  )}
                </div>
              </Autocomplete.Empty>

              <Autocomplete.List className="outline-none">
                {(group: CommandGroup) => (
                  <Autocomplete.Group key={group.value} items={group.items}>
                    <Autocomplete.GroupLabel className="px-3 pt-2 pb-1 text-caption font-semibold tracking-[0.08em] text-muted-soft">
                      {group.label}
                    </Autocomplete.GroupLabel>
                    <Autocomplete.Collection>
                      {(item: CommandItem) => {
                        const Icon = item.icon;
                        return (
                          <Autocomplete.Item
                            key={item.key}
                            value={item}
                            onClick={() => activate(item)}
                            className="flex min-h-10 w-full cursor-default items-start gap-3 rounded-sm px-3 py-2 text-left outline-none select-none data-highlighted:bg-surface-soft"
                          >
                            <Icon size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-copy text-ink">
                                {item.label}
                              </span>
                              {item.hint && (
                                <span className="mt-0.5 block truncate text-meta text-muted">
                                  {item.hint}
                                </span>
                              )}
                            </span>
                          </Autocomplete.Item>
                        );
                      }}
                    </Autocomplete.Collection>
                  </Autocomplete.Group>
                )}
              </Autocomplete.List>
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-hairline px-4 py-2 text-caption text-muted">
              <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
              <span aria-hidden>
                {loading ? "搜索中…" : term ? `${resultCount} 条结果` : "输入关键词搜索"}
              </span>
            </div>
          </Autocomplete.Root>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
