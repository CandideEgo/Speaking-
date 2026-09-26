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
