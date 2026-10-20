import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classNames, cn, formatCount, relativeTime } from "@/lib/utils";

describe("cn", () => {
  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("skips falsy values", () => {
    expect(cn("a", false, null, undefined, 0, "b")).toBe("a b");
  });

  // 回归：tailwind-merge 默认不认 @theme 里的自定义字号刻度，会把
  // `text-meta text-muted` 归到同一组、丢掉字号类。Globals 里 12/13/15/24/30
  // 的字号层级全靠这几条不被吃掉。
  it("keeps custom font-size tokens when a text color is present", () => {
    expect(cn("text-meta", "text-muted")).toBe("text-meta text-muted");
    expect(cn("text-copy", "text-ink")).toBe("text-copy text-ink");
    expect(cn("text-caption", "text-muted-soft")).toBe("text-caption text-muted-soft");
    expect(cn("font-mono", "text-copy-lg", "text-brand-700")).toBe(
      "font-mono text-copy-lg text-brand-700"
    );
  });

  it("still lets a later custom font-size win", () => {
    expect(cn("text-copy", "text-copy-lg")).toBe("text-copy-lg");
    expect(cn("text-display-sm", "sm:text-display")).toBe("text-display-sm sm:text-display");
  });
});

describe("classNames", () => {
  it("joins truthy classes with a space", () => {
    const on = true;
    const off = false;
    expect(classNames("a", on && "b", off && "c", null, undefined, "d")).toBe("a b d");
  });
});

describe("formatCount", () => {
  it("returns integers below 10000 as-is", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(987)).toBe("987");
    expect(formatCount(9999)).toBe("9999");
  });

  it("formats exact 万 multiples without a decimal point", () => {
    expect(formatCount(10000)).toBe("1万");
    expect(formatCount(20000)).toBe("2万");
  });

  it("keeps one decimal for non-exact 万 values", () => {
    expect(formatCount(12345)).toBe("1.2万");
    expect(formatCount(105000)).toBe("10.5万");
  });

  it("rounds up to a whole 万 when the decimal is .0", () => {
    expect(formatCount(99999)).toBe("10万");
  });
});

describe("relativeTime", () => {
  const NOW = new Date("2026-09-19T12:00:00Z").getTime();
  const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 刚刚 within 60 seconds (and for future dates)", () => {
    expect(relativeTime(iso(30 * 1000))).toBe("刚刚");
    expect(relativeTime(iso(-60 * 1000))).toBe("刚刚");
  });

  it("formats minutes under an hour", () => {
    expect(relativeTime(iso(5 * 60 * 1000))).toBe("5 分钟前");
    expect(relativeTime(iso(59 * 60 * 1000))).toBe("59 分钟前");
  });

  it("formats hours under a day", () => {
    expect(relativeTime(iso(60 * 60 * 1000))).toBe("1 小时前");
    expect(relativeTime(iso(23 * 60 * 60 * 1000))).toBe("23 小时前");
  });

  it("formats days under 30 days", () => {
    expect(relativeTime(iso(24 * 60 * 60 * 1000))).toBe("1 天前");
    expect(relativeTime(iso(29 * 24 * 60 * 60 * 1000))).toBe("29 天前");
  });

  it("formats weeks from 30 days onward", () => {
    expect(relativeTime(iso(30 * 24 * 60 * 60 * 1000))).toBe("4 周前");
    expect(relativeTime(iso(70 * 24 * 60 * 60 * 1000))).toBe("10 周前");
  });

  it("returns 刚刚 for unparseable input", () => {
    expect(relativeTime("not-a-date")).toBe("刚刚");
  });
});
