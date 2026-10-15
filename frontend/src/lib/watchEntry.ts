/**
 * Source markers for the watch page.
 *
 * Every link into `/watch/{id}` carries a `?from=` origin so the watch page can
 * send the user back where they came from (and restore that page's URL state)
 * instead of a hardcoded `/browse`. `from` is an enum, never a free-form return
 * URL, so the mapping below cannot be turned into an open redirect — the same
 * reasoning as `lib/authHelpers.safeNext`, solved by enumeration instead of
 * validation.
 *
 * The watch page resolves the marker with `resolveWatchReturn` and navigates
 * with `router.replace`, not `push`: pushing would build the history loop
 * "home → watch → home → browser back → watch again".
 */

import type { Subtitle } from "@/types";

export type WatchSource =
  "home" | "channel" | "set" | "drill" | "search" | "favorites" | "history" | "rankings" | "browse";

export interface WatchEntry {
  /** Surface the link was clicked on. */
  from: WatchSource;
  /**
   * Origin params forwarded onto the watch URL. Two reasons a caller passes
   * them: the return target needs them (`home` forwards its raw
   * category/level/sort so the return URL is byte-identical to the one the user
   * left), or the watch page itself needs them (`t`, `word`, `note`).
   */
  extra?: Record<string, string | number | null | undefined>;
}

export interface WatchReturn {
  /** In-app path to return to. */
  href: string;
  /** Button label for that target. */
  label: string;
}

/** User-facing name of each origin surface. */
const SOURCE_LABELS: Record<WatchSource, string> = {
  home: "返回首页",
  channel: "返回频道",
  // `/browse` is the nav tab titled 频道 (MobileTabBar / TopBar), so the same
  // label is correct for both channel-ish origins; only the target differs.
  browse: "返回频道",
  set: "返回词库",
  drill: "返回训练",
  search: "返回搜索",
  favorites: "返回收藏",
  history: "返回历史",
  rankings: "返回排行榜",
};

/** Home filter keys carried round-trip; every other param is ignored on return. */
const HOME_FILTER_KEYS = ["category", "level", "sort"] as const;

function appendParam(
  parts: string[],
  key: string,
  value: string | number | null | undefined
): void {
  if (value === null || value === undefined) return;
  const text = String(value);
  if (!text) return;
  parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
}

/** `?from=…&…` for a watch URL, or "" when there is nothing to carry. */
export function buildWatchEntryQuery(entry: WatchEntry): string {
  const parts: string[] = [];
  appendParam(parts, "from", entry.from);
  if (entry.extra) {
    for (const key of Object.keys(entry.extra)) {
      if (key === "from") continue;
      appendParam(parts, key, entry.extra[key]);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Watch-page href for a card/dropdown link. Without `entry` the URL is bare. */
export function watchHref(videoId: string, entry?: WatchEntry): string {
  const base = `/watch/${encodeURIComponent(videoId)}`;
  return entry ? `${base}${buildWatchEntryQuery(entry)}` : base;
}

/**
 * Sentence-focus params (S7b, 设计文档 §6.1 甲方案): land the watch page on one
 * subtitle, highlighted, with the word highlighted too. `sub` beats `t` when
 * both would be present — a sentence id is stable, seconds drift with
 * re-transcription. Every 「回到对应句子」/「去原视频」 link (集合详情页、训练页)
 * is built through here so the contract lives in one place.
 */
export interface SentenceFocus {
  subtitleId?: string | null;
  startTime?: number | null;
  word?: string | null;
}

export function sentenceFocusParams(focus: SentenceFocus): Record<string, string> {
  const params: Record<string, string> = {};
  if (focus.subtitleId) params.sub = focus.subtitleId;
  if (
    typeof focus.startTime === "number" &&
    Number.isFinite(focus.startTime) &&
    focus.startTime >= 0
  ) {
    params.t = String(Math.floor(focus.startTime));
  }
  if (focus.word) params.word = focus.word;
  return params;
}

/** Watch-page href for a specific sentence + word, on top of `entry`'s params. */
export function watchSentenceHref(
  videoId: string,
  entry: WatchEntry,
  focus: SentenceFocus
): string {
  return watchHref(videoId, { ...entry, extra: { ...entry.extra, ...sentenceFocusParams(focus) } });
}

/**
 * What a sentence-focus deep link asks the watch page to do — the consuming
 * half of `sentenceFocusParams`. `null` means "this URL carries no focus at
 * all" (neither a sentence, a word, nor a legacy seek), which is the common
 * case: it is how the caller tells a focus link from every other visit.
 *
 * `subtitleIndex` is `null` when the link brought no `sub`, **and also** when
 * it brought one that no longer matches a subtitle — re-transcription
 * renumbers ids, and the old behaviour was to fall through to `t` rather than
 * fail the link. Use it (not `seconds`) as the "resume the follow" signal: a
 * sentence the page cannot point at has nothing to follow.
 */
export interface WatchFocus {
  /**
   * Which params the link carried — not where they resolved to. The watch page
   * applies a focus once per link (a re-render must not yank playback back to
   * the sentence), so it dedupes on this key; keying on the resolution instead
   * would re-apply after subtitles are re-fetched and their times shift.
   */
  key: string;
  /** Index into the current subtitle list; null when the link names no sentence. */
  subtitleIndex: number | null;
  /** Seek target in seconds; null when the link only highlights a word. */
  seconds: number | null;
  /** Word to highlight; null when the link names none. */
  word: string | null;
}

/**
 * Resolve a watch URL's focus params against the video's subtitles.
 *
 * `sub` wins over `t` for the seek target — a sentence id is stable, seconds
 * drift with re-transcription — and a `sub` that no longer resolves degrades to
 * `t` instead of dropping the seek. Empty values do not count as a focus
 * (`?t=` alone resolves to `null`), which is what the watch page's own
 * truthiness guard used to decide. Unrelated params (`from`, `slug`, `note`)
 * are ignored, so they do not affect `key` and cannot re-trigger a focus.
 */
export function resolveWatchFocus(
  params: URLSearchParams,
  subtitles: Subtitle[]
): WatchFocus | null {
  const sub = params.get("sub");
  const word = params.get("word");
  const t = params.get("t");
  if (!sub && !word && !t) return null;

  let subtitleIndex: number | null = null;
  let seconds: number | null = null;
  if (sub) {
    const idx = subtitles.findIndex((s) => s.id === sub);
    if (idx !== -1) {
      subtitleIndex = idx;
      seconds = subtitles[idx].start_time;
    }
  }
  if (seconds === null && t) {
    const parsed = parseFloat(t);
    if (!Number.isNaN(parsed) && parsed >= 0) seconds = parsed;
  }
  return {
    key: `${sub ?? ""}|${word ?? ""}|${t ?? ""}`,
    subtitleIndex,
    seconds,
    word: word || null,
  };
}

function isWatchSource(value: string | null): value is WatchSource {
  return value !== null && Object.prototype.hasOwnProperty.call(SOURCE_LABELS, value);
}

/**
 * Return target for the watch page, derived from its own search params.
 * `null` means "no usable marker" — the caller should fall back to
 * `router.back()` (and `/` when there is no history to pop).
 */
export function resolveWatchReturn(params: URLSearchParams): WatchReturn | null {
  const from = params.get("from");
  if (!isWatchSource(from)) return null;
  const label = SOURCE_LABELS[from];

  switch (from) {
    case "home": {
      const parts: string[] = [];
      for (const key of HOME_FILTER_KEYS) appendParam(parts, key, params.get(key));
      return { href: parts.length ? `/?${parts.join("&")}` : "/", label };
    }
    case "channel": {
      const slug = params.get("slug");
      return slug ? { href: `/channels/${encodeURIComponent(slug)}`, label } : null;
    }
    case "set": {
      const setId = params.get("set");
      return setId ? { href: `/vocabulary/sets/${encodeURIComponent(setId)}`, label } : null;
    }
    case "search": {
      const q = params.get("q");
      return { href: q ? `/search?q=${encodeURIComponent(q)}` : "/search", label };
    }
    case "drill":
      return { href: "/vocabulary/drill", label };
    case "favorites":
      return { href: "/favorites", label };
    case "history":
      return { href: "/history", label };
    case "rankings":
      return { href: "/rankings", label };
    case "browse":
      return { href: "/browse", label };
  }
}
