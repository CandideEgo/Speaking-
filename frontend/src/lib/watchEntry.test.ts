import { describe, expect, it } from "vitest";

import { buildWatchEntryQuery, resolveWatchReturn, watchHref } from "@/lib/watchEntry";

/** Build the URLSearchParams the watch page would see from a query suffix. */
function params(query: string): URLSearchParams {
  return new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
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
  it("returns the bare path without an entry", () => {
    expect(watchHref("abc-123")).toBe("/watch/abc-123");
  });

  it("appends the entry query", () => {
    expect(watchHref("abc", { from: "rankings" })).toBe("/watch/abc?from=rankings");
  });
});

describe("resolveWatchReturn", () => {
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
      href: "/browse",
      label: "返回频道",
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

  it("falls back to null when the marker is missing, unknown or incomplete", () => {
    expect(resolveWatchReturn(params(""))).toBeNull();
    expect(resolveWatchReturn(params("?t=30&word=cat"))).toBeNull();
    expect(resolveWatchReturn(params("?from=somewhere-else"))).toBeNull();
    expect(resolveWatchReturn(params("?from=channel"))).toBeNull();
    expect(resolveWatchReturn(params("?from=set"))).toBeNull();
  });
});
