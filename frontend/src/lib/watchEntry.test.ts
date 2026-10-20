import { describe, expect, it } from "vitest";

import {
  buildWatchEntryQuery,
  resolveWatchFocus,
  resolveWatchReturn,
  sentenceFocusParams,
  watchHref,
  watchSentenceHref,
} from "@/lib/watchEntry";
import type { Subtitle } from "@/types";

/** Build the URLSearchParams the watch page would see from a query suffix. */
function params(query: string): URLSearchParams {
  return new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
}

/** Minimal subtitle rows: the resolver only reads `id` and `start_time`. */
function subs(rows: Array<{ id: string; start_time: number }>): Subtitle[] {
  return rows.map((row) => ({ ...row }) as Subtitle);
}

describe("buildWatchEntryQuery", () => {
  it("emits only the source marker when there is no extra", () => {
    expect(buildWatchEntryQuery({ from: "favorites" })).toBe("?from=favorites");
  });

  it("keeps the caller's param order and encodes values", () => {
    expect(
      buildWatchEntryQuery({
        from: "search",
        extra: { q: "hello world", t: 42 },
      })
    ).toBe("?from=search&q=hello%20world&t=42");
  });

  it("drops null, undefined and empty params", () => {
    expect(
      buildWatchEntryQuery({
        from: "home",
        extra: { category: null, level: undefined, sort: "" },
      })
    ).toBe("?from=home");
  });

  it("cannot be overridden by an extra named from", () => {
    expect(buildWatchEntryQuery({ from: "home", extra: { from: "search" } })).toBe("?from=home");
  });
});

describe("watchHref", () => {
  it("returns vocabulary sentence lookups to the vocabulary page", () => {
    expect(resolveWatchReturn(params("from=vocabulary&word=habit"))).toEqual({
      href: "/vocabulary",
      label: "返回词汇",
    });
  });
  it("returns the bare path without an entry", () => {
    expect(watchHref("abc-123")).toBe("/watch/abc-123");
  });

  it("appends the entry query", () => {
    expect(watchHref("abc", { from: "rankings" })).toBe("/watch/abc?from=rankings");
  });
});

describe("sentenceFocusParams / watchSentenceHref (S7b)", () => {
  it("emits sub, t and word", () => {
    expect(sentenceFocusParams({ subtitleId: "s1", startTime: 12.7, word: "cat" })).toEqual({
      sub: "s1",
      t: "12",
      word: "cat",
    });
  });

  it("can request playback when a sentence deep link opens", () => {
    expect(sentenceFocusParams({ subtitleId: "s1", startTime: 12.7, autoplay: true })).toEqual({
      sub: "s1",
      t: "12",
      autoplay: "1",
    });
  });

  it("drops missing fields individually", () => {
    expect(sentenceFocusParams({ subtitleId: "s1" })).toEqual({ sub: "s1" });
    expect(sentenceFocusParams({ startTime: 5 })).toEqual({ t: "5" });
    expect(sentenceFocusParams({ word: "cat" })).toEqual({ word: "cat" });
    expect(sentenceFocusParams({})).toEqual({});
  });

  it("rejects non-finite and negative start times", () => {
    expect(sentenceFocusParams({ startTime: Number.NaN })).toEqual({});
    expect(sentenceFocusParams({ startTime: -3 })).toEqual({});
    expect(sentenceFocusParams({ startTime: null })).toEqual({});
  });

  it("merges focus params onto the origin entry", () => {
    expect(
      watchSentenceHref(
        "abc",
        { from: "set", extra: { set: "s9" } },
        { subtitleId: "sub-1", startTime: 30.2, word: "apple" }
      )
    ).toBe("/watch/abc?from=set&set=s9&sub=sub-1&t=30&word=apple");
  });
});

describe("resolveWatchFocus (S7b consuming half)", () => {
  const list = subs([
    { id: "s1", start_time: 12.5 },
    { id: "s2", start_time: 40 },
  ]);

  it("resolves a sentence id to its index and start time", () => {
    expect(resolveWatchFocus(params("?sub=s2"), list)).toEqual({
      key: "s2||",
      subtitleIndex: 1,
      seconds: 40,
      word: null,
    });
  });

  it("carries the word alongside the sentence", () => {
    expect(resolveWatchFocus(params("?sub=s1&word=cat"), list)).toEqual({
      key: "s1|cat|",
      subtitleIndex: 0,
      seconds: 12.5,
      word: "cat",
    });
  });

  it("keeps sub over t when both are present", () => {
    expect(resolveWatchFocus(params("?sub=s1&t=900"), list)?.seconds).toBe(12.5);
  });

  it("falls back to t when the sentence id no longer resolves", () => {
    expect(resolveWatchFocus(params("?sub=s-gone&t=90"), list)).toEqual({
      key: "s-gone||90",
      subtitleIndex: null,
      seconds: 90,
      word: null,
    });
  });

  it("seeks a legacy t-only link without touching the follow", () => {
    expect(resolveWatchFocus(params("?t=30"), list)).toEqual({
      key: "||30",
      subtitleIndex: null,
      seconds: 30,
      word: null,
    });
  });

  it("ignores a negative or unparsable t", () => {
    expect(resolveWatchFocus(params("?t=-3"), list)?.seconds).toBeNull();
    expect(resolveWatchFocus(params("?t=abc"), list)?.seconds).toBeNull();
  });

  it("highlights a word-only link without seeking", () => {
    expect(resolveWatchFocus(params("?word=cat"), list)).toEqual({
      key: "|cat|",
      subtitleIndex: null,
      seconds: null,
      word: "cat",
    });
  });

  it("keys the link by its own params, not by the visit", () => {
    const bare = resolveWatchFocus(params("?sub=s1"), list);
    const withOrigin = resolveWatchFocus(params("?from=favorites&sub=s1&note=1"), list);
    expect(withOrigin?.key).toBe(bare?.key);
    expect(resolveWatchFocus(params("?sub=s2"), list)?.key).not.toBe(bare?.key);
  });

  it("treats autoplay as a distinct deep-link action", () => {
    expect(resolveWatchFocus(params("?sub=s1&autoplay=1"), list)?.key).toBe("s1|||play");
    expect(resolveWatchFocus(params("?sub=s1"), list)?.key).toBe("s1||");
  });

  it("returns null when there is nothing to focus on", () => {
    expect(resolveWatchFocus(params(""), list)).toBeNull();
    expect(resolveWatchFocus(params("?from=favorites"), list)).toBeNull();
    expect(resolveWatchFocus(params("?t="), list)).toBeNull();
    expect(resolveWatchFocus(params("?sub="), list)).toBeNull();
  });

  it("resolves a sentence id against an empty list as not found", () => {
    expect(resolveWatchFocus(params("?sub=s1"), [])?.subtitleIndex).toBeNull();
  });

  it("round-trips what sentenceFocusParams produced", () => {
    const query = sentenceFocusParams({ subtitleId: "s2", startTime: 39.4, word: "cat" });
    expect(resolveWatchFocus(params(`?${new URLSearchParams(query)}`), list)).toEqual({
      key: "s2|cat|39",
      subtitleIndex: 1,
      seconds: 40,
      word: "cat",
    });
  });
});

describe("resolveWatchReturn", () => {
  it("preserves a grouped search page without accepting arbitrary return paths", () => {
    expect(
      resolveWatchReturn(params("?from=search&q=good%20habit&group=subtitles&page=3&t=12"))?.href
    ).toBe("/search?q=good%20habit&group=subtitles&page=3");
    expect(
      resolveWatchReturn(params("?from=search&q=habit&group=https://evil.example&page=-1"))?.href
    ).toBe("/search?q=habit");
  });
  it("maps every source to its target and label", () => {
    expect(resolveWatchReturn(params("?from=channel&slug=ted-daily"))).toEqual({
      href: "/channels/ted-daily",
      label: "返回频道",
    });
    expect(resolveWatchReturn(params("?from=set&set=68f3"))).toEqual({
      href: "/vocabulary/sets/68f3",
      label: "返回词库",
    });
    expect(resolveWatchReturn(params("?from=drill"))).toEqual({
      href: "/vocabulary/drill",
      label: "返回训练",
    });
    expect(resolveWatchReturn(params("?from=search&q=cats"))).toEqual({
      href: "/search?q=cats",
      label: "返回搜索",
    });
    expect(resolveWatchReturn(params("?from=favorites"))).toEqual({
      href: "/favorites",
      label: "返回收藏",
    });
    expect(resolveWatchReturn(params("?from=history"))).toEqual({
      href: "/history",
      label: "返回历史",
    });
    expect(resolveWatchReturn(params("?from=rankings"))).toEqual({
      href: "/rankings",
      label: "返回排行榜",
    });
    expect(resolveWatchReturn(params("?from=browse"))).toEqual({
      href: "/",
      label: "返回首页",
    });
    // 旧链接兼容：`/browse` 已并入首页，筛选参数原样带到 `/`。
    expect(resolveWatchReturn(params("?from=browse&category=ted&sort=hot"))).toEqual({
      href: "/?category=ted&sort=hot",
      label: "返回首页",
    });
  });

  it("rebuilds the home URL from the forwarded filter params", () => {
    expect(resolveWatchReturn(params("?from=home&category=ted&level=B1&sort=hot"))).toEqual({
      href: "/?category=ted&level=B1&sort=hot",
      label: "返回首页",
    });
  });

  it("returns bare / for an unfiltered home origin", () => {
    expect(resolveWatchReturn(params("?from=home"))).toEqual({ href: "/", label: "返回首页" });
  });

  it("ignores params the home URL does not own", () => {
    expect(resolveWatchReturn(params("?from=home&t=30&word=cat"))).toEqual({
      href: "/",
      label: "返回首页",
    });
  });

  it("returns /search without a query when q is missing", () => {
    expect(resolveWatchReturn(params("?from=search"))).toEqual({
      href: "/search",
      label: "返回搜索",
    });
  });

  it("returns to the transcript document when the video id is known", () => {
    expect(resolveWatchReturn(params("?from=transcript"), "abc-123")).toEqual({
      href: "/watch/abc-123/transcript",
      label: "返回文稿",
    });
    // 没有 id 就拼不出文稿地址 —— 退化为「没有可用标记」，由调用方走浏览器后退。
    expect(resolveWatchReturn(params("?from=transcript"))).toBeNull();
  });

  it("falls back to null when the marker is missing, unknown or incomplete", () => {
    expect(resolveWatchReturn(params(""))).toBeNull();
    expect(resolveWatchReturn(params("?t=30&word=cat"))).toBeNull();
    expect(resolveWatchReturn(params("?from=somewhere-else"))).toBeNull();
    expect(resolveWatchReturn(params("?from=channel"))).toBeNull();
    expect(resolveWatchReturn(params("?from=set"))).toBeNull();
  });
});
